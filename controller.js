'use strict';

let _ = require('lodash');
let Changesets = require('./changesets.js');
let errors = require('./errors.js');
let RuleFor = require('./statements/rulefor.js');

class SerializedState {
  constructor(state) {
    this.state = state;
  }
  toJSON() {
    return this.state;
  }
  toString() {
    return JSON.stringify(this.state, null, 2);
  }
  equals(other) {
    return _.isEqual(this.state, other.state);
  }
}

class Controller {
  constructor(module) {
    this.errorHandler = (msg, e) => { throw e; };
    this.resetHandler = () => {};
    this.module = module;
    this.views = [];
    this.execution = [{
      msg: 'Initial state',
      state: this.serializeState(),
      index: 0,
    }];

    this.invariants = [];
    this.module.env.invariants.forEachLocal((invariant, name) => {
      this.invariants.push({
        name: name,
        // if if false, checking the invariant is a waste of time
        active: true,
        // if !active, a change in one of these variables will
        // make the invariant active
        readset: null,
        check: context => invariant.check(context),
      });
    });

    this.checkInvariants();

    this.rulesets = [];
    let makeRule = (name, _fire) => {
      let rule = {};
      rule.name = name;
      rule.fire = () => {
        let context = {readset: new Set()};
        let changes = this.tryChangeState(() => {
          _fire(context);
          return name;
        });
        if (Changesets.empty(changes)) {
          rule.active = false;
          rule.readset = context.readset;
        }
        return changes;
      };
      rule.active = true;
      rule.readset = null;
      return rule;
    };

    module.env.rules.forEachLocal((rule, name) => {
      if (rule instanceof RuleFor) {
        let ruleset = {};
        let update = () => {
          let context = {readset: new Set()};
          let rules = [];
          rule.expr.evaluate(context).forEach((v, i) => {
            rules.push(makeRule(`${name}(${i})`,
              context => rule.fire(i, context)));
          });
          ruleset.readset = context.readset;
          ruleset.rules = rules;
        };
        ruleset.source = rule;
        update();
        ruleset.update = update;
        this.rulesets.push(ruleset);
      } else {
        this.rulesets.push({
          readset: [],
          rules: [makeRule(name, context => rule.fire(context))],
          update: _.noop,
          source: rule,
        });
      }
    });
  }

  reportChanges(changes) {
    let affected = readset => (changes === undefined ||
      Changesets.affected(changes, readset));

    this.invariants.forEach(invariant => {
      if (!invariant.active && affected(invariant.readset)) {
          invariant.active = true;
          invariant.readset = null;
      }
    });
    this.rulesets.forEach(ruleset => {
      if (affected(ruleset.readset)) {
        ruleset.update();
      } else {
        ruleset.rules.forEach(rule => {
          if (!rule.active && affected(rule.readset)) {
            rule.active = true;
            rule.readset = null;
          }
        });
      }
    });
  }

  getRulesets() {
    return this.rulesets;
  }

  checkInvariants() {
    for (let invariant of this.invariants) {
      if (invariant.active) {
        let context = {readset: new Set()};
        try {
          invariant.check(context);
          invariant.readset = context.readset;
        } catch ( e ) {
          if (e instanceof errors.Runtime) {
            let msg = `Failed invariant ${invariant.name}: ${e}`;
            this.errorHandler(msg, e);
            return false;
          } else {
            throw e;
          }
        }
      }
    }
    return true;
  }

  serializeState() {
    let state = {};
    this.module.env.vars.forEachLocal((mvar, name) => {
      if (!mvar.isConstant) {
        state[name] = mvar.toJSON();
      }
    });
    return new SerializedState(state);
  }

  restoreState(state) {
    state = state.toJSON();
    this.module.env.vars.forEachLocal((mvar, name) => {
      if (!mvar.isConstant) {
        mvar.assignJSON(state[name]);
      }
    });
    this.reportChanges();
  }

  tryChangeState(mutator) {
    let oldState = this.execution[this.execution.length - 1].state;
    let msg = mutator();
    if (msg === undefined) {
      msg = 'state changed';
    }
    let newState = this.serializeState();
    let changes = Changesets.compareJSON(oldState.toJSON(), newState.toJSON());
    if (Changesets.empty(changes)) {
      return changes;
    } else {
      msg += ' (changed ' + changes.join(', ') + ')';
      console.log(msg, JSON.stringify(Array.from(changes)));
      this.execution.push({
        msg: msg,
        state: newState,
        index: this.execution.length,
      });
      this.reportChanges(changes);
      this.checkInvariants();
      this.updateViews();
      return changes;
    }
  }

  wouldChangeState(mutator) {
    let oldState = this.execution[this.execution.length - 1].state;
    mutator();
    let newState = this.serializeState();
    let changes = Changesets.compareJSON(oldState.toJSON(), newState.toJSON());
    if (Changesets.empty(changes)) {
      return false;
    } else {
      this.restoreState(oldState);
      return changes;
    }
  }

  resetToStartingState() {
    console.log('reset');
    this.module.env.vars.forEachLocal((mvar, name) => {
      mvar.assign(mvar.type.makeDefaultValue());
    });
    let context = {};
    this.module.ast.execute(context); // run global initialization code
    this.execution = [{
      msg: 'Reset',
      state: this.serializeState(),
      index: 0,
    }];
    this.resetHandler();
    this.updateViews();
  }

  restore(snapshot) {
    console.log('restore');
    this.execution = this.execution.slice(0, snapshot.index + 1);
    this.restoreState(this.execution[this.execution.length - 1].state);
    this.reportChanges();
    this.updateViews();
    this.checkInvariants();
  }

  updateViews() {
    this.views.forEach(view => view.update());
  }
}

module.exports = Controller;

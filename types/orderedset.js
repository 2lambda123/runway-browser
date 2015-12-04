"use strict";

let orderedset = {};
module.exports = orderedset;

let makeType = require('./factory.js');
let Type = require('./type.js');
let Value = require('./value.js');
let errors = require('../errors.js');
let NumberValue = require('./number.js');
let RangeValue = require('./range.js');

class OrderedSetValue extends Value {
  constructor(type) {
    super(type);
    let length = this.type.indextype.high - this.type.indextype.low + 1;
    this.items = Array.from({
      length: length
    },
      () => this.type.valuetype.makeDefaultValue());
    this.used = 0;
  }
  usedItems() {
    return this.items.filter((v, i) => i < this.used);
  }
  index(i) {
    if (i instanceof NumberValue.Value || i instanceof RangeValue.Value) {
      i = i.value;
    }
    if (typeof i !== 'number') {
      throw new errors.Internal(`Trying to index array with ${i}`);
    }
    if (i < this.type.indextype.low || i > this.type.indextype.low + this.used) {
      throw new errors.Bounds(`Cannot access index ${i} of ${this}`);
    }
    let v = this.items[i - this.type.indextype.low];
    if (v == undefined) {
      throw new errors.Internal(`Bounds check failed to catch issue: ${i}`);
    }
    return v;
  }
  forEach(cb) {
    this.usedItems().forEach((v, i) => cb(v, this.type.indextype.low + i));
  }
  toString() {
    let inner = this.usedItems().map((v, i) => {
      return `${this.type.indextype.low + i}: ${v.toString()}`;
    }).join(', ');
    return `{${inner}}`;
  }
  push(v) {
    if (this.contains(v)) {
      return;
    }
    if (this.full()) {
      throw new errors.Bounds(`Cannot push onto ${this}`);
    }
    this.items[this.used] = v;
    this.used += 1;
  }
  pop() {
    if (this.used == 0) {
      throw new errors.Bounds(`Cannot pop from empty set ${this}`);
    }
    this.used -= 1;
    this.items.push(this.type.valuetype.makeDefaultValue());
    return this.items.shift();
  }
  remove(v) {
    let index = this.usedItems().findIndex(item => item.equals(v));
    if (index >= 0) {
      this.items = this.items.slice(0, index)
        .concat(this.items.slice(index + 1))
        .concat([this.type.valuetype.makeDefaultValue()]);
      return true;
    }
    return false;
  }
  contains(v) {
    let ret = false;
    this.forEach(x => {
      if (x.equals(v)) {
        ret = true;
      }
    });
    return ret;
  }
  empty() {
    return this.used == 0;
  }
  full() {
    return this.used == this.type.indextype.high - this.type.indextype.low + 1;
  }
}

class OrderedSetType extends Type {
  constructor(decl, env, name) {
    super(decl, env, name);
    this.valuetype = makeType.make(this.decl.args[0], this.env);
    this.indextype = makeType.make(this.decl.indexBy, this.env);
  }
  makeDefaultValue() {
    return new OrderedSetValue(this);
  }
  toString() {
    return `OrderedSet<${this.valueType}>[${this.indexType}]`;
  }
}

orderedset.Type = OrderedSetType;
orderedset.Value = OrderedSetValue;
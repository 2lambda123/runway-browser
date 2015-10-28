"use strict";

let ArrayType = require('./array.js');
let Either = require('./either.js');
let NumberType = require('./number.js').Type;
let RangeType = require('./range.js').Type;
let RecordType = require('./record.js');


let subtypeOf = function(sub, par) {
  if (sub == par) {
    return true;
  }
  if (sub instanceof NumberType &&
    par instanceof RangeType) {
    // let runtime check handle this for now
    return true;
  }
  if (sub instanceof RangeType &&
    par instanceof RangeType) {
    // let runtime check handle this for now
    return true;
  }
  if (sub instanceof Either.Variant &&
    par instanceof Either.Type &&
    sub.parenttype == par) {
    return true;
  }
  return false;
};

let haveEquality = function(left, right) {
  if (subtypeOf(left, right)) {
    return true;
  }
  if (subtypeOf(right, left)) {
    return true;
  }
  if (left instanceof Either.Variant &&
    right instanceof Either.Variant &&
    left.parenttype == right.parenttype) {
    return true;
  }
  return false;
};

let isNumeric = function(t) {
  return t instanceof NumberType || t instanceof RangeType;
};

let haveOrdering = function(left, right) {
  return isNumeric(left) && isNumeric(right);
};

module.exports = {
  subtypeOf: subtypeOf,
  haveEquality: haveEquality,
  haveOrdering: haveOrdering,
  isNumeric: isNumeric,
};

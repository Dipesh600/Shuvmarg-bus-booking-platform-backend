"use strict";
const { toMinorUnits, fromMinorUnits } = require("./money");

function parseEsewaAmount(value) {
  if (typeof value === "string") {
    // Accept the provider's grouped decimal format, not arbitrary comma removal.
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) throw new Error("Invalid eSewa amount");
    value = value.replace(/,/g, "");
  }
  return fromMinorUnits(toMinorUnits(value, { allowZero: false }));
}

module.exports = { parseEsewaAmount };

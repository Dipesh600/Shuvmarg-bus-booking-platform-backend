"use strict";

function toMinorUnits(value, { allowZero = true } = {}) {
  if (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error("Amount must be a finite number with at most two decimal places");
  }
  if (!["number", "string"].includes(typeof value)) throw new Error("Invalid monetary amount");
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(minor)
    || Math.abs(amount * 100 - minor) > 0.000001 || minor < 0 || (!allowZero && minor === 0)) {
    throw new Error("Amount must be a finite positive number with at most two decimal places");
  }
  return minor;
}

const fromMinorUnits = minor => {
  if (!Number.isSafeInteger(minor)) throw new Error("Invalid monetary units");
  return minor / 100;
};

module.exports = { toMinorUnits, fromMinorUnits };

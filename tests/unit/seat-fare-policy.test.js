"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSeatFareOverrides, calculateSeatTotal } = require("../../src/domain/fare/seat-fare.policy");

test("seat fare defaults every seat to base fare and applies explicit exceptions", () => {
  const overrides = normalizeSeatFareOverrides([{ seatLabel: " a1 ", fare: 1100 }]);
  assert.deepEqual(overrides, [{ seatLabel: "A1", fare: 1100 }]);
  assert.equal(calculateSeatTotal(800, overrides, ["a1", "a2"]), 1900);
});

test("seat fare rejects duplicate, blank, and non-positive overrides", () => {
  assert.throws(() => normalizeSeatFareOverrides([{ seatLabel: "A1", fare: 900 }, { seatLabel: "a1", fare: 950 }]), /duplicated/);
  assert.throws(() => normalizeSeatFareOverrides([{ seatLabel: "", fare: 900 }]), /required/);
  assert.throws(() => normalizeSeatFareOverrides([{ seatLabel: "A1", fare: 0 }]), /positive/);
});

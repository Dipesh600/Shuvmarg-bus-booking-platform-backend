"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACCESS_SCOPES,
  COMMISSION_MODES,
  DEFAULT_COMMISSION,
  DEFAULT_PERMISSIONS,
  MAX_COMMISSION_PERCENT,
  isAccessScope,
  isCommissionMode,
  isCommissionValid,
} = require("../../../../src/shared/identity/agent-assignment-terms.js");

test("access scopes", async (t) => {
  await t.test("are the three the master plan names", () => {
    assert.deepEqual(Object.keys(ACCESS_SCOPES).sort(), ["ALL_BUSES", "ROUTES", "SCHEDULES"]);
  });

  await t.test("recognise only own properties", () => {
    assert.equal(isAccessScope("ROUTES"), true);
    assert.equal(isAccessScope("constructor"), false);
    assert.equal(isAccessScope(undefined), false);
    // The legacy Agent.busAccessScope vocabulary is not this one.
    assert.equal(isAccessScope("ALL_OPERATOR_BUSES"), false);
    assert.equal(isAccessScope("SPECIFIC_ROUTES"), false);
  });
});

test("commission modes", async (t) => {
  await t.test("are the three the master plan names", () => {
    assert.deepEqual(
      Object.keys(COMMISSION_MODES).sort(),
      ["FLAT_PER_BOOKING", "FLAT_PER_SEAT", "PERCENT"],
    );
  });

  await t.test("recognise only own properties", () => {
    assert.equal(isCommissionMode("PERCENT"), true);
    assert.equal(isCommissionMode("constructor"), false);
    assert.equal(isCommissionMode(undefined), false);
  });
});

test("default permissions", async (t) => {
  await t.test("withhold cancellation", () => {
    // Cancellation moves money and inventory. A permissive default would grant
    // it to every agent nobody configured.
    assert.equal(DEFAULT_PERMISSIONS.canCancel, false);
    assert.equal(DEFAULT_PERMISSIONS.cancelWindowMins, 0);
  });

  await t.test("allow selling, which is the point of the assignment", () => {
    assert.equal(DEFAULT_PERMISSIONS.canSellCash, true);
    assert.equal(DEFAULT_PERMISSIONS.canSellOnline, true);
  });

  await t.test("invent no seat cap", () => {
    // null is uncapped. No such limit exists in this codebase, so a number here
    // would be policy smuggled in as a default.
    assert.equal(DEFAULT_PERMISSIONS.maxSeatsPerBooking, null);
  });

  await t.test("grant no discount authority", () => {
    assert.equal(DEFAULT_PERMISSIONS.maxDiscountPct, 0);
  });

  await t.test("are frozen", () => {
    assert.throws(() => { DEFAULT_PERMISSIONS.canCancel = true; }, TypeError);
  });
});

test("default commission", async (t) => {
  await t.test("is an explicit zero rather than an absent mode", () => {
    assert.deepEqual({ ...DEFAULT_COMMISSION }, { mode: "PERCENT", value: 0 });
  });

  await t.test("is itself valid", () => {
    assert.equal(isCommissionValid(DEFAULT_COMMISSION.mode, DEFAULT_COMMISSION.value), true);
  });
});

test("commission validity", async (t) => {
  await t.test("caps PERCENT at 100", () => {
    assert.equal(MAX_COMMISSION_PERCENT, 100);
    assert.equal(isCommissionValid("PERCENT", 0), true);
    assert.equal(isCommissionValid("PERCENT", 12.5), true);
    assert.equal(isCommissionValid("PERCENT", 100), true);
    // More than the fare is not a commission.
    assert.equal(isCommissionValid("PERCENT", 100.01), false);
    assert.equal(isCommissionValid("PERCENT", 150), false);
  });

  await t.test("leaves the flat modes unbounded above", () => {
    // The fare is unknown when terms are set, so an upper bound here would be
    // second-guessing a deal we are not party to.
    assert.equal(isCommissionValid("FLAT_PER_SEAT", 5000), true);
    assert.equal(isCommissionValid("FLAT_PER_BOOKING", 5000), true);
  });

  await t.test("rejects negatives in every mode", () => {
    for (const mode of Object.keys(COMMISSION_MODES)) {
      assert.equal(isCommissionValid(mode, -1), false, `${mode} must reject -1`);
    }
  });

  await t.test("rejects values that are not finite numbers", () => {
    assert.equal(isCommissionValid("PERCENT", Number.NaN), false);
    assert.equal(isCommissionValid("PERCENT", Infinity), false);
    assert.equal(isCommissionValid("FLAT_PER_SEAT", Infinity), false);
    // A numeric string is not a number: coercing here would let "10abc" through
    // as 10 elsewhere.
    assert.equal(isCommissionValid("PERCENT", "10"), false);
    assert.equal(isCommissionValid("PERCENT", null), false);
    assert.equal(isCommissionValid("PERCENT", undefined), false);
  });

  await t.test("rejects an unrecognised mode outright", () => {
    assert.equal(isCommissionValid("FLAT", 10), false);
    assert.equal(isCommissionValid("constructor", 10), false);
    assert.equal(isCommissionValid(undefined, 10), false);
  });
});

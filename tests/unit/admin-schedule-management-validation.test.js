"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isValidTime,
  validateRecurrence,
  validateCreation,
} = require("../../src/modules/admin/schedule-management/schedule-validation.policy.js");

const valid = {
  brandId: "brand-1",
  busId: "bus-1",
  departureTime: "08:30",
  arrivalTime: "12:45",
  shift: "day",
  recurrence: "DAILY",
  effectiveFrom: "2026-08-01",
};

test("admin schedule creation validation preserves legacy contracts", async (t) => {
  await t.test("accepts HH:MM and rejects other time shapes", () => {
    assert.equal(isValidTime("08:30"), true);
    assert.equal(isValidTime("8:30"), false);
    assert.throws(
      () => validateCreation({ ...valid, departureTime: "8:30" }),
      { message: "departureTime must be in HH:MM format." }
    );
    assert.throws(
      () => validateCreation({ ...valid, arrivalTime: "12.45" }),
      { message: "arrivalTime must be in HH:MM format." }
    );
  });

  await t.test("preserves every required-field message", () => {
    const fields = [
      ["brandId", "brandId is required."],
      ["busId", "busId is required."],
      ["departureTime", "departureTime is required (HH:MM)."],
      ["arrivalTime", "arrivalTime is required (HH:MM)."],
      ["shift", "shift is required (day/night)."],
      ["recurrence", "recurrence is required (DAILY/WEEKLY/CUSTOM)."],
      ["effectiveFrom", "effectiveFrom is required."],
    ];
    for (const [field, message] of fields) {
      assert.throws(() => validateCreation({ ...valid, [field]: undefined }), {
        message,
      });
    }
  });

  await t.test("weekly and custom recurrence require valid weekdays", () => {
    for (const recurrence of ["WEEKLY", "CUSTOM"]) {
      assert.throws(() => validateRecurrence(recurrence), {
        message:
          `daysOfWeek is required when recurrence is "${recurrence}". ` +
          "Provide an array of 0–6 (Sun–Sat).",
      });
    }
    assert.throws(() => validateRecurrence("WEEKLY", [1, 7]), {
      message: "daysOfWeek must contain values 0–6 only.",
    });
    assert.doesNotThrow(() => validateRecurrence("WEEKLY", [0, 3, 6]));
    assert.doesNotThrow(() => validateRecurrence("DAILY"));
  });

  await t.test("effectiveUntil must follow effectiveFrom", () => {
    assert.throws(
      () =>
        validateCreation({
          ...valid,
          effectiveUntil: valid.effectiveFrom,
        }),
      { message: "effectiveUntil must be after effectiveFrom." }
    );
    assert.doesNotThrow(() =>
      validateCreation({ ...valid, effectiveUntil: "2026-09-01" })
    );
  });
});

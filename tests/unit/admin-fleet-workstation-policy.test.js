"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dayBounds,
  monthStart,
  shiftUtcDays,
} = require("../../src/modules/admin/fleet-workstation/time.policy");
const {
  TRANSITIONS,
  canTransition,
} = require("../../src/modules/admin/fleet-workstation/trip-transition.policy");

test("fleet-workstation UTC time policy", () => {
  const now = new Date("2026-07-27T12:34:56.789Z");
  assert.deepEqual(dayBounds(null, now), {
    start: new Date("2026-07-27T00:00:00.000Z"),
    end: new Date("2026-07-27T23:59:59.999Z"),
  });
  assert.equal(
    monthStart(1, now).toISOString(),
    "2026-06-01T00:00:00.000Z"
  );
  assert.equal(
    shiftUtcDays(now, 30).toISOString(),
    "2026-08-26T12:34:56.789Z"
  );
  assert.equal(now.toISOString(), "2026-07-27T12:34:56.789Z");
});

test("trip transition policy preserves the exact lifecycle", () => {
  assert.deepEqual(TRANSITIONS, {
    scheduled: ["boarding", "cancelled"],
    boarding: ["in-transit", "cancelled"],
    "in-transit": ["completed"],
    completed: [],
    cancelled: [],
  });
  assert.equal(canTransition("scheduled", "boarding"), true);
  assert.equal(canTransition("boarding", "in-transit"), true);
  assert.equal(canTransition("in-transit", "completed"), true);
  assert.equal(canTransition("completed", "scheduled"), false);
  assert.equal(canTransition("unknown", "cancelled"), false);
});

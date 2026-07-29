"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recomputeTimingArray } = require(
  "../../src/modules/admin/operator-route-configuration/timing.policy.js"
);

test("timing policy preserves empty inputs", () => {
  assert.equal(recomputeTimingArray(null), null);
  assert.deepEqual(recomputeTimingArray([]), []);
});

test("timing policy recomputes intermediate departure and final stop", () => {
  assert.deepEqual(recomputeTimingArray([
    { estimatedDeparture: "11:00 PM" },
    {
      estimatedArrival: "11:45 PM", estimatedDeparture: "stale",
      haltDuration: 10,
    },
    { estimatedArrival: "01:00 AM", estimatedDeparture: "stale" },
  ]), [
    { estimatedDeparture: "11:00 PM", dayOffset: 0 },
    {
      estimatedArrival: "11:45 PM",
      estimatedDeparture: "11:55 PM", haltDuration: 10, dayOffset: 0,
    },
    {
      estimatedArrival: "01:00 AM",
      estimatedDeparture: "", dayOffset: 1,
    },
  ]);
});

test("halt crossing midnight advances the day offset", () => {
  const result = recomputeTimingArray([
    { estimatedDeparture: "11:50 PM" },
    { estimatedArrival: "11:58 PM", haltDuration: 5 },
    { estimatedArrival: "12:30 AM" },
  ]);
  assert.equal(result[1].estimatedDeparture, "12:03 AM");
  assert.equal(result[1].dayOffset, 1);
  assert.equal(result[2].dayOffset, 1);
});

test("invalid intermediate arrival remains unchanged", () => {
  assert.deepEqual(recomputeTimingArray([
    { estimatedDeparture: "08:00 AM" },
    { estimatedArrival: "invalid", estimatedDeparture: "keep" },
    { estimatedArrival: "" },
  ]), [
    { estimatedDeparture: "08:00 AM", dayOffset: 0 },
    {
      estimatedArrival: "invalid",
      estimatedDeparture: "keep", dayOffset: 0,
    },
    { estimatedArrival: "", estimatedDeparture: "", dayOffset: 0 },
  ]);
});

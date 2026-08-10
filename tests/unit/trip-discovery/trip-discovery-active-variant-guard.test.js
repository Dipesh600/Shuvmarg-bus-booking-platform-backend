"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  processStopCandidates,
} = require("../../../src/modules/trip-discovery/trip-discovery-stop-processor.js");

function routeStop(variantId, sequence, minutes) {
  return {
    variantId,
    sequence,
    estimatedMinutesFromOrigin: minutes,
    isMajor: true,
  };
}

test("trip discovery never falls back to RouteStops from a draft or inactive variant", async () => {
  const result = await processStopCandidates(["origin"], ["destination"], {
    findCorridors: async () => ({ fwdCorridors: [{ _id: "corridor" }], revCorridors: [] }),
    findVariants: async () => ({ fwdVariants: [], revVariants: [] }),
    findRouteStops: async () => ({
      originRouteStops: [routeStop("draft-variant", 1, 0)],
      destRouteStops: [routeStop("draft-variant", 2, 120)],
    }),
  });

  assert.deepEqual(result.variantIds, []);
  assert.deepEqual(result.stopTimingMap, {});
});

test("trip discovery retains only active Variant route-stop matches", async () => {
  const result = await processStopCandidates(["origin"], ["destination"], {
    findCorridors: async () => ({ fwdCorridors: [{ _id: "corridor" }], revCorridors: [] }),
    findVariants: async () => ({ fwdVariants: [{ _id: "active-variant" }], revVariants: [] }),
    findRouteStops: async () => ({
      originRouteStops: [routeStop("draft-variant", 1, 0), routeStop("active-variant", 1, 0)],
      destRouteStops: [routeStop("draft-variant", 2, 120), routeStop("active-variant", 2, 120)],
    }),
  });

  assert.deepEqual(result.variantIds, ["active-variant"]);
  assert.deepEqual(result.stopTimingMap, {
    "active-variant": { originMins: 0, destMins: 120 },
  });
});

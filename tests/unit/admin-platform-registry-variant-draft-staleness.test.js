"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapVariantDraft,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow.mapper.js");

test("stale route and candidate-engine payloads are never returned to the admin", () => {
  const draft = mapVariantDraft({
    variant: { _id: "variant", corridorId: "corridor", status: "DRAFT", direction: "FORWARD" },
    review: {
      selectedRouteOptionKey: "old-route", reviewStatus: "STOP_CANDIDATES_READY",
      routeDataVersion: 1, candidateEngineVersion: 1,
      routeOptions: [{ optionKey: "old-route", distanceMeters: 1, durationSeconds: 1 }],
    },
    candidates: [{ _id: "old", reviewStatus: "UNREVIEWED", providerSnapshot: { displayName: "Kathmandu" } }],
  });
  assert.deepEqual(draft.routeOptions, []);
  assert.deepEqual(draft.candidates, []);
  assert.equal(draft.nextAction, "SELECT_PATH");
  assert.match(draft.warnings[0], /older engine/i);
});

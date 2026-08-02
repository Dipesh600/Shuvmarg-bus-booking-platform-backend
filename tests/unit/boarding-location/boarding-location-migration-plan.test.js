"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMigrationPlan,
} = require(
  "../../../src/modules/admin/platform-registry/boarding-location-migration/migration-plan.js"
);

function candidate(overrides = {}) {
  return {
    legacyKey: "StopPoint:legacy-1",
    identity: "stop-1:mugling bus park",
    syntheticFallback: false,
    ownerId: null,
    usage: "BOTH",
    locationData: {
      _id: "location-1", stopId: "stop-1", name: "Mugling Bus Park",
      status: "ACTIVE",
    },
    ...overrides,
  };
}

const empty = { locations: [], assignments: [], brands: [] };

test("migration skips synthetic stop fallback records", () => {
  const plan = buildMigrationPlan({
    ...empty, candidates: [candidate({ syntheticFallback: true })],
  });
  assert.equal(plan.safeToApply, true);
  assert.deepEqual(plan.syntheticFallbacks, ["StopPoint:legacy-1"]);
  assert.equal(plan.locationsToCreate.length, 0);
});

test("migration rejects duplicate physical identities", () => {
  const plan = buildMigrationPlan({
    ...empty,
    candidates: [
      candidate(),
      candidate({ legacyKey: "BoardingPoints:legacy-2" }),
    ],
  });
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.identityConflicts.length, 1);
});

test("migration is idempotent for an existing legacy mapping", () => {
  const current = {
    _id: "location-existing",
    _normalizedIdentity: "stop-1:mugling bus park",
    legacySource: { model: "StopPoint", id: "legacy-1" },
  };
  const plan = buildMigrationPlan({
    candidates: [candidate()], locations: [current],
    assignments: [], brands: [],
  });
  assert.equal(plan.safeToApply, true);
  assert.equal(plan.locationsToCreate.length, 0);
  assert.deepEqual(plan.unchanged, ["StopPoint:legacy-1"]);
});

test("private legacy point creates one brand assignment", () => {
  const plan = buildMigrationPlan({
    ...empty,
    candidates: [candidate({
      legacyKey: "BoardingPoints:legacy-1",
      ownerId: "owner-1", usage: "DROP", contactPhone: "9800000000",
    })],
    brands: [{ _id: "brand-1", ownerId: "owner-1" }],
  });
  assert.equal(plan.safeToApply, true);
  assert.deepEqual(plan.assignmentsToCreate[0], {
    brandId: "brand-1", boardingLocationId: "location-1",
    usage: "DROP", contactPhone: "9800000000", status: "PENDING_REVIEW",
  });
});

test("ambiguous operator ownership aborts migration", () => {
  const plan = buildMigrationPlan({
    ...empty,
    candidates: [candidate({ ownerId: "owner-1" })],
  });
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.invalidRecords[0].code, "AMBIGUOUS_OPERATOR_BRAND");
});

test("stale legacy mapping aborts instead of hiding identity drift", () => {
  const input = candidate();
  const existing = {
    _id: "location-1",
    _normalizedIdentity: "stop-1:old name",
    legacySource: { model: "StopPoint", id: "legacy-1" },
  };
  const plan = buildMigrationPlan({
    candidates: [input], locations: [existing], assignments: [], brands: [],
  });
  assert.equal(plan.safeToApply, false);
  assert.equal(
    plan.invalidRecords[0].code,
    "LEGACY_MAPPING_IDENTITY_MISMATCH"
  );
});

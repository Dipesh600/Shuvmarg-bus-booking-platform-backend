"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { runStopRegistryMigration } = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration.service"
);
const {
  STOP_REGISTRY_INDEXES,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/stop-index-definitions"
);

describe("Stop Registry Migration - Index Validation & Safety", () => {
  before(setupTestDb);
  after(teardownTestDb);
  beforeEach(resetTestDb);

  it("non-unique _normalizedIdentity_1 index prevents backfill and index changes", async () => {
    const coll = Stop.collection;
    await coll.insertMany([
      { code: "STP1", name: "StopOne", type: "CITY", status: "ACTIVE", _normalizedIdentity: "stopone:::" }
    ]);

    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }
    await coll.createIndex(
      STOP_REGISTRY_INDEXES.normalizedIdentity.key,
      { name: STOP_REGISTRY_INDEXES.normalizedIdentity.name, unique: false }
    );

    const result = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.safeToApply, false);
    assert.ok(
      result.report.reasons.some(
        r => r.code === "INDEX_CONFIG_INVALID" || r.code === "INVALID_INDEX_CONFIGURATION"
      )
    );

    const finalIndexes = await coll.indexes();
    const identityIdx = finalIndexes.find(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    assert.ok(!identityIdx.unique);

    const stop = await Stop.findOne({ code: "STP1" }).lean();
    assert.strictEqual(stop.isSearchable, undefined);
  });

  it("wrong _normalizedIdentity_1 key prevents backfill", async () => {
    const coll = Stop.collection;
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }
    await coll.createIndex(
      { _normalizedIdentity: -1 },
      { name: STOP_REGISTRY_INDEXES.normalizedIdentity.name, unique: true }
    );

    const result = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.safeToApply, false);
  });

  it("wrong parentStopId_1_status_1 key order prevents backfill", async () => {
    const coll = Stop.collection;
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.parentStatus.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.parentStatus.name);
    }
    await coll.createIndex(
      { status: 1, parentStopId: 1 },
      { name: STOP_REGISTRY_INDEXES.parentStatus.name }
    );

    const result = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.safeToApply, false);
  });

  it("preserves unrelated indexes during migration", async () => {
    await Stop.collection.createIndex({ code: 1, type: 1 }, { name: "custom_code_type_1" });

    const result = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(result.success, true);

    const finalIndexes = (await Stop.collection.indexes()).map(i => i.name);
    assert.ok(finalIndexes.includes("custom_code_type_1"));
    assert.ok(result.indexResult.preserved.includes("custom_code_type_1"));
  });
});

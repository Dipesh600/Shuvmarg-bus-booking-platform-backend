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

describe("Stop Registry Migration - Execution & Backfill", () => {
  before(setupTestDb);
  after(teardownTestDb);
  beforeEach(resetTestDb);

  it("migrates valid stops, backfills fields, swaps indexes, and verifies", async () => {
    const coll = Stop.collection;
    await coll.insertMany([
      { code: "PKR", name: "Pokhara", district: "Kaski", municipality: "PokharaMun", type: "CITY", status: "ACTIVE", _normalizedIdentity: "pokhara:kaski:pokharamun:" }
    ]);

    if (!(await coll.indexes()).some(i => i.name === "_nameLower_1")) {
      await coll.createIndex({ _nameLower: 1 }, { name: "_nameLower_1" });
    }

    const result = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.backfillResult.modified, 1);
    assert.strictEqual(result.verification.passed, true);

    const finalIndexes = (await coll.indexes()).map(i => i.name);
    assert.ok(!finalIndexes.includes("_nameLower_1"), "_nameLower_1 must be dropped");
    assert.ok(finalIndexes.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name));
    assert.ok(finalIndexes.includes(STOP_REGISTRY_INDEXES.parentStatus.name));

    const stop = await Stop.findOne({ code: "PKR" }).lean();
    assert.strictEqual(stop._normalizedIdentity, "pokhara:kaski:pokharamun:");
    assert.strictEqual(stop.isSearchable, true);
    assert.strictEqual(stop.isRouteStop, true);
  });

  it("backfill failure prevents index transition and returns controlled failure", async () => {
    await Stop.collection.insertMany([
      { code: "BKFAIL", name: "BackfillFailStop", type: "CITY", status: "ACTIVE", _normalizedIdentity: "backfillfailstop:::" }
    ]);

    const coll = Stop.collection;
    if (!(await coll.indexes()).some(i => i.name === "_nameLower_1")) {
      await coll.createIndex({ _nameLower: 1 }, { name: "_nameLower_1" });
    }

    const originalBulkWrite = coll.bulkWrite;
    coll.bulkWrite = async () => {
      throw new Error("Simulated database write error during backfill");
    };

    try {
      const result = await runStopRegistryMigration({ dryRun: false });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.safeToApply, true);
      assert.strictEqual(result.indexResult, null, "Index transition must not have run");
      assert.ok(result.error.includes("backfill failed"));

      const indexesAfter = (await coll.indexes()).map(i => i.name);
      assert.ok(indexesAfter.includes("_nameLower_1"), "Legacy index must remain present");
    } finally {
      coll.bulkWrite = originalBulkWrite;
    }
  });
});

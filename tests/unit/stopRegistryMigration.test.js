"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Stop = require("../../models/stopModel");
const { runStopRegistryMigration } = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration.service"
);
const {
  inspectStopIndexes,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/index-inspection"
);
const {
  buildIndexPlan,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/index-plan"
);
const {
  applyIndexPlan,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/index-application"
);
const {
  verifyIndexOutcome,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/index-verification"
);
const {
  STOP_REGISTRY_INDEXES,
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/stop-index-definitions"
);

describe("Stop Registry Migration Preflight & Safety", () => {
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Stop.syncIndexes();
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Stop.deleteMany({});
    await Stop.syncIndexes();
  });

  // 1. Source check
  it("migration source code does not call .syncIndexes() or .createIndexes()", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const migDir = path.resolve(__dirname, "../../src/modules/admin/platform-registry");

    function readAllJs(dir) {
      let src = "";
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) src += readAllJs(full);
        else if (entry.name.endsWith(".js")) src += fs.readFileSync(full, "utf8");
      }
      return src;
    }

    const source = readAllJs(migDir);
    assert.ok(!/\.syncIndexes\s*\(/.test(source), "Must not call .syncIndexes()");
    assert.ok(!/\.createIndexes\s*\(/.test(source), "Must not call .createIndexes()");
  });

  // 2. Preflight ordering & dry run
  it("dry run performs full preflight including index inspection without writing", async () => {
    await Stop.collection.insertMany([
      { code: "KTM", name: "Kathmandu", type: "CITY", status: "ACTIVE", _normalizedIdentity: "kathmandu:::" }
    ]);

    const indexesBefore = (await Stop.collection.indexes()).map(i => i.name).sort();
    const result = await runStopRegistryMigration({ dryRun: true });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.safeToApply, true);
    assert.ok(result.records);
    assert.ok(result.indexes);
    assert.strictEqual(result.backfillResult, null);
    assert.strictEqual(result.indexResult, null);
    assert.strictEqual(result.verification, null);

    const indexesAfter = (await Stop.collection.indexes()).map(i => i.name).sort();
    assert.deepStrictEqual(indexesAfter, indexesBefore);

    const doc = await Stop.findOne({ code: "KTM" }).lean();
    assert.strictEqual(doc.isSearchable, undefined); // Unchanged in dry run!
  });

  // 3. Invalid record data prevents backfill and index changes
  it("invalid stop record prevents backfill and index changes during preflight", async () => {
    await Stop.collection.insertMany([
      { code: "BAD1", name: "", type: "CITY", _normalizedIdentity: "bad1:::" }
    ]);

    const coll = Stop.collection;
    if (!(await coll.indexes()).some(i => i.name === "_nameLower_1")) {
      await coll.createIndex({ _nameLower: 1 }, { name: "_nameLower_1" });
    }

    const indexesBefore = (await coll.indexes()).map(i => i.name).sort();
    const result = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.safeToApply, false);
    assert.ok(result.report.invalid > 0);

    const indexesAfter = (await coll.indexes()).map(i => i.name).sort();
    assert.deepStrictEqual(indexesAfter, indexesBefore);
    assert.ok(indexesAfter.includes("_nameLower_1"));
  });

  // 4. Non-unique identity index prevents backfill and index changes
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
      ),
      "Must include index configuration invalid error reason"
    );

    const finalIndexes = await coll.indexes();
    const identityIdx = finalIndexes.find(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    assert.ok(!identityIdx.unique, "Misconfigured index must remain non-unique (untouched)");

    const stop = await Stop.findOne({ code: "STP1" }).lean();
    assert.strictEqual(stop.isSearchable, undefined, "Backfill must not have run");
  });

  // 5. Wrong identity index key prevents backfill
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

  // 6. Wrong parent/status index key order prevents backfill
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

  // 7. Successful migration & backfill
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

  // 8. Idempotency: second run changes 0 records and 0 indexes
  it("idempotent second run modifies 0 records and 0 indexes", async () => {
    await Stop.collection.insertMany([
      { code: "IDM1", name: "Idempotent", district: "D1", type: "CITY", status: "ACTIVE", _normalizedIdentity: "idempotent:d1::" }
    ]);

    const first = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(first.success, true);

    const second = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.backfillResult.modified, 0);
    assert.strictEqual(second.indexResult.removed.length, 0);
    assert.strictEqual(second.indexResult.created.length, 0);
  });

  // 9. Preserved indexes are kept
  it("preserves unrelated indexes during migration", async () => {
    await Stop.collection.createIndex({ code: 1, type: 1 }, { name: "custom_code_type_1" });

    const result = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(result.success, true);

    const finalIndexes = (await Stop.collection.indexes()).map(i => i.name);
    assert.ok(finalIndexes.includes("custom_code_type_1"));
    assert.ok(result.indexResult.preserved.includes("custom_code_type_1"));
  });

  // 10. Inspection unit tests
  it("inspectStopIndexes identifies correct and invalid index states", async () => {
    const coll = Stop.collection;
    const inspection = await inspectStopIndexes(coll);
    assert.ok(inspection.found);
    assert.ok(inspection.normalizedIdentity);
    assert.ok(inspection.parentStatus);

    const plan = buildIndexPlan(inspection);
    assert.strictEqual(plan.ok, true);
  });

  // 11. applyIndexPlan refuses invalid plan
  it("applyIndexPlan throws error when plan.ok is false", async () => {
    const invalidPlan = {
      ok: false,
      invalidIndexes: [{ errorCode: "BAD", indexName: "x", message: "invalid" }],
      indexesToRemove: [], indexesToCreate: [], indexesAlreadyCorrect: [], preservedIndexes: []
    };

    await assert.rejects(
      () => applyIndexPlan(Stop.collection, invalidPlan),
      /applyIndexPlan called with an invalid plan/
    );
  });

  // 12. verifyIndexOutcome fails on missing index
  it("verifyIndexOutcome flags missing required identity index", async () => {
    const coll = Stop.collection;
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }

    const verification = await verifyIndexOutcome(coll, []);
    assert.strictEqual(verification.passed, false);
    assert.ok(verification.errors.some(e => e.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name)));
  });

  // 13. Backfill failure catches and prevents index application
  it("backfill failure prevents index transition and returns controlled failure", async () => {
    await Stop.collection.insertMany([
      { code: "BKFAIL", name: "BackfillFailStop", type: "CITY", status: "ACTIVE", _normalizedIdentity: "backfillfailstop:::" }
    ]);

    // Create legacy index to verify it is NOT dropped if backfill fails
    const coll = Stop.collection;
    if (!(await coll.indexes()).some(i => i.name === "_nameLower_1")) {
      await coll.createIndex({ _nameLower: 1 }, { name: "_nameLower_1" });
    }

    // Mock bulkWrite to simulate a DB error during backfill
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

      // Verify legacy index was NOT dropped
      const indexesAfter = (await coll.indexes()).map(i => i.name);
      assert.ok(indexesAfter.includes("_nameLower_1"), "Legacy index must remain present");
    } finally {
      coll.bulkWrite = originalBulkWrite;
    }
  });
});

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
  buildIndexPlan,
  applyIndexPlan,
  verifyIndexOutcome
} = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/migration-index.service"
);
const { STOP_REGISTRY_INDEXES } = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration/stop-index-definitions"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertRaw(docs) {
  await Stop.collection.insertMany(docs);
}

function validStop(overrides = {}) {
  return {
    code: `T${String(Math.random()).slice(2, 7)}`,
    name: "TestCity",
    type: "CITY",
    status: "ACTIVE",
    ...overrides
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Stop Registry Migration", () => {
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    // Let Mongoose create its schema-declared indexes on the fresh DB
    await Stop.syncIndexes();
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Stop.deleteMany({});
    // Re-sync so each test starts with a predictable index set
    await Stop.syncIndexes();
  });

  // ── No syncIndexes() in production migration code ─────────────────────────

  it("migration source code does not call syncIndexes()", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    // Only scan production source, not tests.
    // Match the actual call pattern: .syncIndexes( — not bare comments mentioning the name.
    const migDir = path.resolve(
      __dirname,
      "../../src/modules/admin/platform-registry"
    );
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
    // Use a regex that matches the actual method call, not comments or strings describing it
    const callPattern = /\.syncIndexes\s*\(/;
    assert.ok(
      !callPattern.test(source),
      "Production migration code must not call .syncIndexes()"
    );
  });

  // ── Scan phase ────────────────────────────────────────────────────────────

  it("dry run detects invalid records and returns success:false", async () => {
    // Use collection.insertMany with ordered:false and a unique _normalizedIdentity
    // value to avoid the null-identity uniqueness collision on the pre-seeded index.
    await Stop.collection.insertMany([
      { code: "BAD1", name: "", type: "CITY", _normalizedIdentity: "bad1::" },
      { code: "BAD2", name: "Valid", type: "CITY",
        coordinates: { lat: 91, lng: 0 }, _normalizedIdentity: "valid:::" },
      {
        code: "BAD3", name: "MissingParent", type: "CITY",
        parentStopId: new mongoose.Types.ObjectId(),
        _normalizedIdentity: "missingparent:::x"
      }
    ], { ordered: false });

    const { success, report } = await runStopRegistryMigration({ dryRun: true });

    assert.strictEqual(success, false);
    assert.ok(report.invalid > 0);
    assert.ok(report.invalidRecords.some(r => r.errorCode === "INVALID_STOP_NAME"));
    assert.ok(report.invalidRecords.some(r => r.errorCode === "INVALID_STOP_COORDINATES"));
    assert.ok(report.invalidRecords.some(r => r.errorCode === "INVALID_PARENT_STOP"));
  });

  // ── Dry run changes no indexes ────────────────────────────────────────────

  it("dry run does not modify any collection indexes", async () => {
    await insertRaw([{ code: "KTM", name: "Kathmandu", type: "CITY", status: "ACTIVE" }]);

    const before = (await Stop.collection.indexes()).map(i => i.name).sort();
    await runStopRegistryMigration({ dryRun: true });
    const after = (await Stop.collection.indexes()).map(i => i.name).sort();

    assert.deepStrictEqual(after, before);
  });

  // ── Successful migration ──────────────────────────────────────────────────

  it("migrates valid stops and backfills _normalizedIdentity", async () => {
    await insertRaw([{
      code: "PKR", name: "Pokhara", district: "Kaski",
      municipality: "PokharaMun", type: "CITY", status: "ACTIVE"
    }]);

    const { success, report } = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(success, true);
    assert.strictEqual(report.backfillResult.modified, 1);
    assert.strictEqual(report.verification.passed, true);

    const stop = await Stop.findOne({ code: "PKR" });
    // Identity format: name:district:municipality:parentStopId (trailing colon when no parent)
    assert.strictEqual(stop._normalizedIdentity, "pokhara:kaski:pokharamun:");
    assert.strictEqual(stop.isSearchable, true);
    assert.strictEqual(stop.isRouteStop, true);
    assert.strictEqual(stop.parentStopId, null);
  });

  // ── _nameLower_1 alone is removed ────────────────────────────────────────

  it("removes _nameLower_1 when present and creates required indexes", async () => {
    await insertRaw([{ code: "BRT", name: "Biratnagar", type: "CITY", status: "ACTIVE" }]);

    // Manually create the legacy index if not present (simulate pre-migration state)
    const coll = Stop.collection;
    const before = await coll.indexes();
    if (!before.some(i => i.name === "_nameLower_1")) {
      await coll.createIndex({ _nameLower: 1 }, { name: "_nameLower_1" });
    }

    const { success, report } = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(success, true);
    assert.ok(report.indexResult.removed.includes("_nameLower_1"));

    const finalIndexNames = (await coll.indexes()).map(i => i.name);
    assert.ok(!finalIndexNames.includes("_nameLower_1"), "_nameLower_1 must be removed");
    assert.ok(
      finalIndexNames.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name),
      "_normalizedIdentity_1 must be present"
    );
    assert.ok(
      finalIndexNames.includes(STOP_REGISTRY_INDEXES.parentStatus.name),
      "parentStopId_1_status_1 must be present"
    );
  });

  // ── Unrelated indexes are preserved ──────────────────────────────────────

  it("preserves unrelated indexes during migration", async () => {
    await insertRaw([{ code: "CHT", name: "Chitwan", type: "CITY", status: "ACTIVE" }]);

    // Add an unrelated custom index
    await Stop.collection.createIndex({ code: 1, type: 1 }, { name: "custom_code_type_1" });

    const { success, report } = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(success, true);

    const finalIndexNames = (await Stop.collection.indexes()).map(i => i.name);
    assert.ok(
      finalIndexNames.includes("custom_code_type_1"),
      "Unrelated index custom_code_type_1 must survive"
    );
    assert.ok(
      report.indexResult.preserved.includes("custom_code_type_1"),
      "Preserved list must include custom_code_type_1"
    );
  });

  // ── Correctly existing indexes are not recreated ─────────────────────────

  it("skips creation of indexes that already exist correctly", async () => {
    await insertRaw([{ code: "DRN", name: "Darain", type: "TOWN", status: "ACTIVE" }]);

    // Run once to create indexes
    await runStopRegistryMigration({ dryRun: false });

    // Run again — indexes should already be correct
    const { success, report } = await runStopRegistryMigration({ dryRun: false });

    assert.strictEqual(success, true);
    assert.strictEqual(report.indexResult.created.length, 0,
      "No indexes should be created on second run");
    assert.ok(
      report.indexResult.alreadyCorrect.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name)
    );
    assert.ok(
      report.indexResult.alreadyCorrect.includes(STOP_REGISTRY_INDEXES.parentStatus.name)
    );
  });

  // ── Wrong identity index uniqueness causes abort ──────────────────────────

  it("aborts if _normalizedIdentity_1 exists but is not unique", async () => {
    await insertRaw([{ code: "ABC", name: "Abctown", type: "CITY", status: "ACTIVE" }]);

    const coll = Stop.collection;
    // Drop correct unique index if it was created by syncIndexes
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }
    // Create a non-unique version to simulate misconfiguration
    await coll.createIndex(
      STOP_REGISTRY_INDEXES.normalizedIdentity.key,
      { name: STOP_REGISTRY_INDEXES.normalizedIdentity.name, unique: false }
    );

    const inspection = await inspectStopIndexes(coll);
    const plan = buildIndexPlan(inspection);

    assert.strictEqual(plan.ok, false);
    assert.ok(plan.invalidIndexes.length > 0);
    assert.ok(
      plan.invalidIndexes.some(e => e.indexName === STOP_REGISTRY_INDEXES.normalizedIdentity.name)
    );
  });

  // ── Wrong parent index definition causes abort ────────────────────────────

  it("aborts if parentStopId_1_status_1 has wrong key", async () => {
    const coll = Stop.collection;
    // Drop correct index if present
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.parentStatus.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.parentStatus.name);
    }
    // Create with wrong key order
    await coll.createIndex(
      { status: 1, parentStopId: 1 },
      { name: STOP_REGISTRY_INDEXES.parentStatus.name }
    );

    const inspection = await inspectStopIndexes(coll);
    const plan = buildIndexPlan(inspection);

    assert.strictEqual(plan.ok, false);
    assert.ok(
      plan.invalidIndexes.some(e => e.indexName === STOP_REGISTRY_INDEXES.parentStatus.name)
    );
  });

  // ── Idempotency: second run produces no changes ───────────────────────────

  it("idempotency: second run modifies 0 records and 0 indexes", async () => {
    await insertRaw([
      { code: "IDM1", name: "Idempotent", district: "D1", municipality: "M1",
        type: "CITY", status: "ACTIVE" }
    ]);

    const first = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(first.success, true);

    const second = await runStopRegistryMigration({ dryRun: false });
    assert.strictEqual(second.success, true);
    assert.strictEqual(second.report.backfillResult.modified, 0,
      "Second run must not modify any records");
    assert.strictEqual(second.report.indexResult.removed.length, 0,
      "Second run must not remove any indexes");
    assert.strictEqual(second.report.indexResult.created.length, 0,
      "Second run must not create any indexes");
  });

  // ── verifyIndexOutcome detects missing unrelated index ───────────────────

  it("verifyIndexOutcome fails when a preserved index was dropped", async () => {
    // Add an unrelated index
    await Stop.collection.createIndex({ type: 1 }, { name: "type_1_unrelated" });

    // Drop it manually to simulate accidental loss
    await Stop.collection.dropIndex("type_1_unrelated");

    const result = await verifyIndexOutcome(Stop.collection, ["type_1_unrelated"]);

    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some(e => e.includes("type_1_unrelated")),
      "Verification must flag the missing unrelated index"
    );
  });

  // ── verifyIndexOutcome detects wrong unique setting ───────────────────────

  it("verifyIndexOutcome fails when _normalizedIdentity_1 is not unique", async () => {
    const coll = Stop.collection;
    // Drop correct index if present
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }
    // Create non-unique version
    await coll.createIndex(
      STOP_REGISTRY_INDEXES.normalizedIdentity.key,
      { name: STOP_REGISTRY_INDEXES.normalizedIdentity.name, unique: false }
    );

    const result = await verifyIndexOutcome(coll, []);

    assert.strictEqual(result.passed, false);
    assert.ok(
      result.errors.some(e => e.includes("not unique")),
      "Verification must flag the non-unique identity index"
    );
  });

  // ── applyIndexPlan throws if called with invalid plan ────────────────────

  it("applyIndexPlan throws when plan.ok is false", async () => {
    const badPlan = {
      ok: false,
      invalidIndexes: [{ indexName: "x", errorCode: "INDEX_CONFIG_INVALID", message: "bad" }],
      indexesToRemove: [],
      indexesToCreate: [],
      indexesAlreadyCorrect: [],
      preservedIndexes: []
    };

    await assert.rejects(
      () => applyIndexPlan(Stop.collection, badPlan),
      /applyIndexPlan called with an invalid plan/
    );
  });

  // ── _normalizedIdentity_1 is unique in the final index set ───────────────

  it("_normalizedIdentity_1 is unique after migration", async () => {
    await insertRaw([{ code: "UNQ", name: "Unique", type: "CITY", status: "ACTIVE" }]);
    await runStopRegistryMigration({ dryRun: false });

    const indexes = await Stop.collection.indexes();
    const identityIdx = indexes.find(
      i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name
    );
    assert.ok(identityIdx, "_normalizedIdentity_1 must be present");
    assert.strictEqual(identityIdx.unique, true, "_normalizedIdentity_1 must be unique");
  });

  // ── Final verification detects missing identity index ────────────────────

  it("migration fails verification when _normalizedIdentity_1 is missing", async () => {
    await insertRaw([{ code: "VFY", name: "Verify", type: "CITY", status: "ACTIVE" }]);

    // Run backfill manually so stops have identities but skip index creation
    const { applyStopBackfill } = require(
      "../../src/modules/admin/platform-registry/stop-registry-migration/migration-backfill.service"
    );
    const { scanStopRegistry } = require(
      "../../src/modules/admin/platform-registry/stop-registry-migration/migration-scan.service"
    );

    const scan = await scanStopRegistry();
    await applyStopBackfill(scan.plannedUpdates);

    // Drop the identity index
    const coll = Stop.collection;
    const existing = await coll.indexes();
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }

    const verificationResult = await verifyIndexOutcome(coll, []);

    assert.strictEqual(verificationResult.passed, false);
    assert.ok(
      verificationResult.errors.some(e => e.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name))
    );
  });
});

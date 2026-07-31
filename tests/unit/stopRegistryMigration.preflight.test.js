"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
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

describe("Stop Registry Migration - Preflight Checks", () => {
  before(setupTestDb);
  after(teardownTestDb);
  beforeEach(resetTestDb);

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

    const indexesAfter = (await Stop.collection.indexes()).map(i => i.name).sort();
    assert.deepStrictEqual(indexesAfter, indexesBefore);

    const doc = await Stop.findOne({ code: "KTM" }).lean();
    assert.strictEqual(doc.isSearchable, undefined);
  });

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
  });

  it("inspectStopIndexes identifies correct and invalid index states", async () => {
    const coll = Stop.collection;
    const inspection = await inspectStopIndexes(coll);
    assert.ok(inspection.found);
    assert.ok(inspection.normalizedIdentity);
    assert.ok(inspection.parentStatus);

    const plan = buildIndexPlan(inspection);
    assert.strictEqual(plan.ok, true);
  });

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

  it("verifyIndexOutcome flags missing required identity index", async () => {
    const coll = Stop.collection;
    const existing = await coll.indexes();
    const { STOP_REGISTRY_INDEXES } = require("../../src/modules/admin/platform-registry/stop-registry-migration/stop-index-definitions");
    if (existing.some(i => i.name === STOP_REGISTRY_INDEXES.normalizedIdentity.name)) {
      await coll.dropIndex(STOP_REGISTRY_INDEXES.normalizedIdentity.name);
    }

    const verification = await verifyIndexOutcome(coll, []);
    assert.strictEqual(verification.passed, false);
    assert.ok(verification.errors.some(e => e.includes(STOP_REGISTRY_INDEXES.normalizedIdentity.name)));
  });
});

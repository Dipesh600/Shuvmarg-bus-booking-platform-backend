"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { runStopRegistryMigration } = require(
  "../../src/modules/admin/platform-registry/stop-registry-migration.service"
);

describe("Stop Registry Migration - Idempotency", () => {
  before(setupTestDb);
  after(teardownTestDb);
  beforeEach(resetTestDb);

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
});

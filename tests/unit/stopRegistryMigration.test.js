"use strict";

const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const Stop = require("../../models/stopModel");
const { runStopRegistryMigration } = require("../../src/modules/admin/platform-registry/stop-registry-migration.service");

// Note: To run this properly, we need a DB connection. 
// We will test the logic by mocking the database or just connecting to a test DB if MONGODB_URL is provided.
// For now, we'll write the tests relying on mongoose connection if available, or skip if not.

test("Stop Registry Migration Service", async (t) => {
  let dbConnected = false;
  
  await t.test("setup", async () => {
    if (!process.env.MONGODB_URL && !process.env.DB_URL) {
      console.log("Skipping DB tests because MONGODB_URL is not set.");
      return;
    }
    await mongoose.connect(process.env.MONGODB_URL || process.env.DB_URL);
    dbConnected = true;
    await Stop.deleteMany({});
  });

  await t.test("scan detects invalid records", async (t) => {
    if (!dbConnected) return;

    await Stop.deleteMany({});
    
    // Insert some raw invalid data directly using collection.insertMany to bypass mongoose validation
    await Stop.collection.insertMany([
      { code: "TEST1", name: "", type: "CITY" }, // invalid name
      { code: "TEST2", name: "Valid", type: "CITY", coordinates: { lat: 91, lng: 0 } }, // invalid coords
      { code: "TEST3", name: "CycleA", type: "CITY", parentStopId: new mongoose.Types.ObjectId() } // missing parent
    ]);
    
    const { success, abortReason, report } = await runStopRegistryMigration({ dryRun: true });
    
    assert.strictEqual(success, false);
    assert.strictEqual(report.invalid > 0, true);
    assert.strictEqual(report.invalidRecords.some(r => r.errorCode === 'INVALID_STOP_NAME'), true);
    assert.strictEqual(report.invalidRecords.some(r => r.errorCode === 'INVALID_STOP_COORDINATES'), true);
    assert.strictEqual(report.invalidRecords.some(r => r.errorCode === 'INVALID_PARENT_STOP'), true);
  });

  await t.test("successfully migrates valid data", async (t) => {
    if (!dbConnected) return;
    
    await Stop.deleteMany({});
    
    // valid old data
    await Stop.collection.insertMany([
      { _id: new mongoose.Types.ObjectId(), code: "OLD1", name: "KTM", district: "KTM", municipality: "KTM", type: "CITY" }
    ]);
    
    const { success, report } = await runStopRegistryMigration({ dryRun: false });
    
    assert.strictEqual(success, true);
    assert.strictEqual(report.backfillResult.modified, 1);
    assert.strictEqual(report.verification.passed, true);
    
    const stop = await Stop.findOne({ code: "OLD1" });
    assert.strictEqual(stop._normalizedIdentity, "ktm:ktm:ktm");
    assert.strictEqual(stop.isSearchable, true);
    assert.strictEqual(stop.isRouteStop, true);
    assert.strictEqual(stop.parentStopId, null);
  });

  await t.test("idempotency - running again makes no changes", async (t) => {
    if (!dbConnected) return;
    
    const { success, report } = await runStopRegistryMigration({ dryRun: false });
    
    assert.strictEqual(success, true);
    assert.strictEqual(report.backfillResult.modified, 0);
  });

  await t.test("teardown", async () => {
    if (dbConnected) {
      await Stop.deleteMany({});
      await mongoose.disconnect();
    }
  });
});

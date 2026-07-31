const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel");
const { bulkPreviewStops, bulkImportStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");

describe("Stop Bulk Import Service", () => {
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    await Stop.syncIndexes();
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Stop.deleteMany({});
  });

  describe("bulkPreviewStops", () => {
    it("should categorize valid, invalid, duplicate code, and duplicate identity", async () => {
      await Stop.create({ code: "KTM", name: "Kathmandu" });
      await Stop.create({ code: "PKR", name: "Pokhara", district: "Kaski" });

      const payload = [
        { code: "KTM", name: "Kathmandu Duplicate Code" }, // 0: Duplicate code
        { code: "PKR2", name: "Pokhara", district: "Kaski" }, // 1: Duplicate identity
        { code: "BRD", name: "Bhairahawa" }, // 2: Valid new
        { code: "BRD2", name: "Bhairahawa" }, // 3: Duplicate within batch (identity)
        { code: "INV", name: "" }, // 4: Invalid missing name
      ];

      const result = await bulkPreviewStops(payload);

      assert.equal(result.invalid.length, 1);
      assert.equal(result.invalid[0].errorCode, "INVALID_STOP_DATA");
      assert.equal(result.invalid[0].index, 4);

      assert.equal(result.duplicateCode.length, 1);
      assert.equal(result.duplicateCode[0]._sourceIndex, 0);

      assert.equal(result.duplicateIdentity.length, 1);
      assert.equal(result.duplicateIdentity[0]._sourceIndex, 1);

      assert.equal(result.duplicateWithinBatch.length, 1);
      assert.equal(result.duplicateWithinBatch[0]._sourceIndex, 3);
      assert.equal(result.duplicateWithinBatch[0].conflictReason, "IDENTITY_CONFLICT");

      assert.equal(result.toInsert.length, 1);
      assert.equal(result.toInsert[0].code, "BRD");
    });
  });

  describe("bulkImportStops", () => {
    it("should only import valid, non-duplicate stops and return standardized errors", async () => {
      await Stop.create({ code: "KTM", name: "Kathmandu" });

      const payload = [
        { code: "KTM", name: "Kathmandu" }, // 0: DB Duplicate Code
        { code: "PKR", name: "Pokhara" }, // 1: Valid
        { code: "PKR2", name: "Pokhara" }, // 2: Batch Duplicate Identity
        { code: "ABC", name: "" } // 3: Invalid validation
      ];

      const result = await bulkImportStops(payload);

      assert.equal(result.inserted, 1);
      assert.equal(result.invalidCount, 3);
      
      const errTypes = result.errors.map(e => e.errorCode).sort();
      // Should have STOP_CODE_CONFLICT, DUPLICATE_WITHIN_BATCH, INVALID_STOP_DATA
      assert.ok(errTypes.includes("STOP_CODE_CONFLICT"));
      assert.ok(errTypes.includes("DUPLICATE_WITHIN_BATCH"));
      assert.ok(errTypes.includes("INVALID_STOP_DATA"));
      
      const dbStops = await Stop.find({});
      assert.equal(dbStops.length, 2); // KTM and PKR
    });
  });
});

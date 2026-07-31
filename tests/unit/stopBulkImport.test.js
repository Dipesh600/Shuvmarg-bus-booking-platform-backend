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
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
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
      await Stop.createWithUniqueCode({ code: "KTM", name: "Kathmandu" });
      await Stop.createWithUniqueCode({ code: "PKR", name: "Pokhara", district: "Kaski" });

      const payload = [
        { code: "KTM", name: "Kathmandu Duplicate Code" }, // Duplicate code
        { code: "PKR2", name: "Pokhara", district: "Kaski" }, // Duplicate identity
        { code: "BRD", name: "Bhairahawa" }, // Valid new
        { code: "BRD2", name: "Bhairahawa" }, // Duplicate within batch (identity)
        { code: "INV", name: "" }, // Invalid missing name
      ];

      const result = await bulkPreviewStops(payload);

      assert.equal(result.invalid.length, 1);
      assert.equal(result.duplicateCode.length, 1);
      assert.equal(result.duplicateIdentity.length, 1);
      assert.equal(result.duplicateWithinBatch.length, 1);
      assert.equal(result.toInsert.length, 1);
      assert.equal(result.toInsert[0].code, "BRD");
    });
  });

  describe("bulkImportStops", () => {
    it("should only import valid, non-duplicate stops", async () => {
      await Stop.createWithUniqueCode({ code: "KTM", name: "Kathmandu" });

      const payload = [
        { code: "KTM", name: "Kathmandu" }, // Duplicate code & identity
        { code: "PKR", name: "Pokhara" }, // Valid
        { code: "PKR2", name: "Pokhara" }, // Duplicate within batch
      ];

      const result = await bulkImportStops(payload);

      assert.equal(result.inserted, 1);
      assert.equal(result.invalidCount, 1); // 1 error from Duplicate within batch identity
      assert.equal(result.errors.length, 1); // 1 error from existing DB conflict
      
      const dbStops = await Stop.find({});
      assert.equal(dbStops.length, 2); // KTM and PKR
    });
  });
});

const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel");
const { bulkPreviewStops, bulkImportStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");
const { mapBulkWriteError, detectDuplicateConflict } = require("../../src/modules/admin/platform-registry/stop-bulk-import/bulk-error-mapper");

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

  describe("bulk-error-mapper unit tests", () => {
    it("should classify code conflict correctly", () => {
      const err = { code: 11000, keyPattern: { code: 1 }, errmsg: "E11000 dup key code_1" };
      const entry = { _sourceIndex: 5, code: "KTM", name: "Kathmandu" };
      const result = mapBulkWriteError(err, entry);

      assert.equal(result.errorCode, "STOP_CODE_CONFLICT");
      assert.equal(result.message, "A stop with this code already exists.");
      assert.equal(result.index, 5);
      assert.equal(result.code, "KTM");
    });

    it("should classify identity conflict correctly", () => {
      const err = { code: 11000, keyPattern: { _normalizedIdentity: 1 } };
      const entry = { _sourceIndex: 2, code: "PKR", name: "Pokhara" };
      const result = mapBulkWriteError(err, entry);

      assert.equal(result.errorCode, "STOP_IDENTITY_CONFLICT");
      assert.equal(result.message, "A stop with the same geographic identity already exists.");
      assert.equal(result.index, 2);
    });

    it("should classify unknown duplicate key error as DUPLICATE_STOP", () => {
      const err = { code: 11000 };
      const entry = { _sourceIndex: 1, code: "HTD", name: "Hetauda" };
      const result = mapBulkWriteError(err, entry);

      assert.equal(result.errorCode, "DUPLICATE_STOP");
      assert.equal(result.message, "The stop conflicts with an existing registry record.");
    });

    it("should classify generic write error as BULK_WRITE_ERROR", () => {
      const err = { code: 121, message: "Document failed validation" };
      const entry = { _sourceIndex: 0, code: "BRT", name: "Biratnagar" };
      const result = mapBulkWriteError(err, entry);

      assert.equal(result.errorCode, "BULK_WRITE_ERROR");
      assert.equal(result.message, "The stop could not be imported.");
    });
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

  describe("bulkImportStops & Error Sanitization", () => {
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
      assert.ok(errTypes.includes("STOP_CODE_CONFLICT"));
      assert.ok(errTypes.includes("DUPLICATE_WITHIN_BATCH"));
      assert.ok(errTypes.includes("INVALID_STOP_DATA"));

      const dbStops = await Stop.find({});
      assert.equal(dbStops.length, 2);
    });

    it("should NEVER leak raw MongoDB driver or error messages in API response", async () => {
      await Stop.create({ code: "LEAK1", name: "LeakTestStop" });

      const payload = [
        { code: "LEAK1", name: "LeakTestStop" },
      ];

      const result = await bulkImportStops(payload);
      const serialized = JSON.stringify(result);

      for (const forbidden of [
        "E11000",
        "duplicate key",
        "dup key",
        "MongoBulkWriteError",
        "MongoServerError",
        "index:",
        "collection:",
        "errmsg",
      ]) {
        assert.equal(
          serialized.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `Response leaked database detail: "${forbidden}"`
        );
      }
    });

    it("should guarantee input immutability during preview and import", async () => {
      const payload = [
        { code: "IMMUT1", name: "Immutability Stop 1", aliases: ["immut"] },
        { code: "IMMUT2", name: "Immutability Stop 2", coordinates: { lat: 27.7, lng: 85.3 } },
      ];

      const clone1 = structuredClone(payload);
      await bulkPreviewStops(payload);
      assert.deepEqual(payload, clone1, "bulkPreviewStops must not mutate input payload");

      const clone2 = structuredClone(payload);
      await bulkImportStops(payload);
      assert.deepEqual(payload, clone2, "bulkImportStops must not mutate input payload");

      // Verify DB documents do NOT contain _sourceIndex
      const doc = await Stop.findOne({ code: "IMMUT1" }).lean();
      assert.equal(doc._sourceIndex, undefined, "_sourceIndex must not be stored in MongoDB");
    });

    it("should preserve original source row index mapping during filtered bulk insertion errors", async () => {
      await Stop.create({ code: "DUPCODE", name: "Existing Stop" });

      const payload = [
        { code: "INVALID1", name: "" },                     // Row 0: Invalid data
        { code: "DUPCODE", name: "Existing Stop Duplicate" } // Row 1: Valid format, but DB Code Conflict
      ];

      const result = await bulkImportStops(payload);

      assert.equal(result.errors.length, 2);
      const invalidRow0 = result.errors.find(e => e.errorCode === "INVALID_STOP_DATA");
      const conflictRow1 = result.errors.find(e => e.errorCode === "STOP_CODE_CONFLICT");

      assert.equal(invalidRow0.index, 0, "Invalid row error must retain sourceIndex 0");
      assert.equal(conflictRow1.index, 1, "Conflict error must retain original sourceIndex 1");
    });
  });
});

const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { bulkImportStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");

describe("Real insertMany() Bulk Write Failures - Basic Mappings", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

  it("handles code duplicate key error from insertMany with STOP_CODE_CONFLICT", async () => {
    const payload = [{ code: "VALID1", name: "Valid Stop One" }];
    const originalInsertMany = Stop.insertMany;
    try {
      Stop.insertMany = async () => {
        const err = new Error("MongoBulkWriteError");
        err.writeErrors = [
          {
            index: 0,
            code: 11000,
            keyPattern: { code: 1 },
            errmsg: 'E11000 duplicate key collection: test.stops index: code_1 dup key: { code: "VALID1" }',
          },
        ];
        err.insertedDocs = [];
        throw err;
      };

      const result = await bulkImportStops(payload);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].errorCode, "STOP_CODE_CONFLICT");
      assert.equal(result.errors[0].message, "A stop with this code already exists.");
    } finally {
      Stop.insertMany = originalInsertMany;
    }
  });

  it("handles generic insertMany write failure (code 121) with BULK_WRITE_ERROR", async () => {
    const payload = [{ code: "VALID1", name: "Valid Stop One" }];
    const originalInsertMany = Stop.insertMany;
    try {
      Stop.insertMany = async () => {
        const err = new Error("MongoBulkWriteError");
        err.writeErrors = [
          { index: 0, code: 121, errmsg: "Document failed validation in MongoDB" },
        ];
        err.insertedDocs = [];
        throw err;
      };

      const result = await bulkImportStops(payload);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].errorCode, "BULK_WRITE_ERROR");
      assert.equal(result.errors[0].message, "The stop could not be imported.");
    } finally {
      Stop.insertMany = originalInsertMany;
    }
  });

  it("handles identity duplicate key error from insertMany with STOP_IDENTITY_CONFLICT", async () => {
    const payload = [{ code: "VALID1", name: "Valid Stop One" }];
    const originalInsertMany = Stop.insertMany;
    try {
      Stop.insertMany = async () => {
        const err = new Error("MongoBulkWriteError");
        err.writeErrors = [
          { index: 0, code: 11000, keyPattern: { _normalizedIdentity: 1 }, errmsg: "E11000..." },
        ];
        err.insertedDocs = [];
        throw err;
      };

      const result = await bulkImportStops(payload);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].errorCode, "STOP_IDENTITY_CONFLICT");
      assert.equal(result.errors[0].message, "A stop with the same geographic identity already exists.");
    } finally {
      Stop.insertMany = originalInsertMany;
    }
  });
});

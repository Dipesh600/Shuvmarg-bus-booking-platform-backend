const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const logger = require("../../utils/logger");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { bulkImportStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");

describe("Real insertMany() Bulk Write Failures - Advanced Cases", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

  it("forces insertMany write failure, preserving original row mapping and partial insert counts", async () => {
    const payload = [
      { code: "INVALID0", name: "" },
      { code: "VALID1", name: "Valid Stop One" },
      { code: "VALID2", name: "Valid Stop Two" },
    ];

    const originalInsertMany = Stop.insertMany;
    try {
      Stop.insertMany = async () => {
        const err = new Error("MongoBulkWriteError");
        err.writeErrors = [
          {
            index: 1,
            code: 11000,
            keyPattern: { code: 1 },
            errmsg: 'E11000 duplicate key collection: test.stops index: code_1 dup key: { code: "VALID2" }',
          },
        ];
        err.insertedDocs = [{}];
        throw err;
      };

      const result = await bulkImportStops(payload);

      assert.equal(result.inserted, 1);
      assert.equal(result.skipped, 2);
      assert.equal(result.invalidCount, 2);

      const row0Error = result.errors.find((e) => e.index === 0);
      const row2Error = result.errors.find((e) => e.index === 2);

      assert.ok(row0Error);
      assert.equal(row0Error.errorCode, "INVALID_STOP_DATA");

      assert.ok(row2Error);
      assert.equal(row2Error.code, "VALID2");
      assert.equal(row2Error.errorCode, "STOP_CODE_CONFLICT");

      const row1Error = result.errors.find((e) => e.index === 1);
      assert.equal(row1Error, undefined);
    } finally {
      Stop.insertMany = originalInsertMany;
    }
  });

  it("sanitizes raw MongoDB details from unordered insertMany write failures", async () => {
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
      const serialized = JSON.stringify(result);

      for (const forbidden of [
        "E11000",
        "duplicate key",
        "dup key",
        "MongoBulkWriteError",
        "MongoServerError",
        "collection:",
        "index:",
        "errmsg",
        "test.stops",
        "code_1",
      ]) {
        assert.equal(
          serialized.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `Response leaked database detail: "${forbidden}"`
        );
      }
    } finally {
      Stop.insertMany = originalInsertMany;
    }
  });

  it("logs internal bulk write failure using logger.error", async () => {
    const originalLoggerError = logger.error;
    const originalInsertMany = Stop.insertMany;
    let loggedMetadata = null;

    try {
      logger.error = (msg, meta) => { loggedMetadata = meta; };
      Stop.insertMany = async () => {
        const err = new Error("MongoBulkWriteError");
        err.writeErrors = [{ index: 0, code: 11000, keyPattern: { code: 1 } }];
        err.insertedDocs = [];
        throw err;
      };

      await bulkImportStops([{ code: "LOGSTOP", name: "Logging Stop" }]);

      assert.ok(loggedMetadata);
      assert.equal(loggedMetadata.mongoCode, 11000);
      assert.equal(loggedMetadata.sourceIndex, 0);
      assert.equal(loggedMetadata.stopCode, "LOGSTOP");
    } finally {
      logger.error = originalLoggerError;
      Stop.insertMany = originalInsertMany;
    }
  });
});

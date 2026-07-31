const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { bulkImportStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");

describe("bulkImportStops - pre-insert DB conflicts & immutability", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

  it("should only import valid, non-duplicate stops and return standardized errors", async () => {
    await Stop.create({ code: "KTM", name: "Kathmandu" });

    const payload = [
      { code: "KTM", name: "Kathmandu" },
      { code: "PKR", name: "Pokhara" },
      { code: "PKR2", name: "Pokhara" },
      { code: "ABC", name: "" }
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

  it("should guarantee input immutability and strip _sourceIndex from DB", async () => {
    const payload = [
      { code: "IMMUT1", name: "Immutability Stop 1", aliases: ["immut"] },
      { code: "IMMUT2", name: "Immutability Stop 2", coordinates: { lat: 27.7, lng: 85.3 } },
    ];

    const clone = structuredClone(payload);
    await bulkImportStops(payload);
    assert.deepEqual(payload, clone, "bulkImportStops must not mutate input payload");

    const doc = await Stop.findOne({ code: "IMMUT1" }).lean();
    assert.equal(doc._sourceIndex, undefined, "_sourceIndex must not be stored in MongoDB");
  });

  it("preserves original source row index mapping during pre-insert database conflict queries", async () => {
    await Stop.create({ code: "DUPCODE", name: "Existing Stop" });

    const payload = [
      { code: "INVALID1", name: "" },
      { code: "DUPCODE", name: "Existing Stop Duplicate" }
    ];

    const result = await bulkImportStops(payload);

    assert.equal(result.errors.length, 2);
    const invalidRow0 = result.errors.find(e => e.errorCode === "INVALID_STOP_DATA");
    const conflictRow1 = result.errors.find(e => e.errorCode === "STOP_CODE_CONFLICT");

    assert.equal(invalidRow0.index, 0, "Invalid row error must retain sourceIndex 0");
    assert.equal(conflictRow1.index, 1, "Conflict error must retain original sourceIndex 1");
  });
});

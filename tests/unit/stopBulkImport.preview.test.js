const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");
const { bulkPreviewStops } = require("../../src/modules/admin/platform-registry/stop-bulk-import.service");

describe("bulkPreviewStops", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

  it("should categorize valid, invalid, duplicate code, and duplicate identity", async () => {
    await Stop.create({ code: "KTM", name: "Kathmandu" });
    await Stop.create({ code: "PKR", name: "Pokhara", district: "Kaski" });

    const payload = [
      { code: "KTM", name: "Kathmandu Duplicate Code" },
      { code: "PKR2", name: "Pokhara", district: "Kaski" },
      { code: "BRD", name: "Bhairahawa" },
      { code: "BRD2", name: "Bhairahawa" },
      { code: "INV", name: "" },
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

  it("should guarantee input immutability during preview", async () => {
    const payload = [
      { code: "IMMUT1", name: "Immutability Stop 1", aliases: ["immut"] },
      { code: "IMMUT2", name: "Immutability Stop 2", coordinates: { lat: 27.7, lng: 85.3 } },
    ];

    const clone = structuredClone(payload);
    await bulkPreviewStops(payload);
    assert.deepEqual(payload, clone, "bulkPreviewStops must not mutate input payload");
  });
});

const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");

describe("Stop Registry Model - Validation", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

  describe("Coordinates Validation", () => {
    it("should reject partial coordinates (lat without lng)", async () => {
      const stop = new Stop({
        name: "Test", code: "TST1",
        coordinates: { lat: 27.7, lng: null }
      });
      await assert.rejects(stop.validate(), /Both latitude and longitude must be provided/);
    });

    it("should reject out of bound coordinates", async () => {
      const stop = new Stop({
        name: "Test", code: "TST2",
        coordinates: { lat: 95, lng: 85 }
      });
      await assert.rejects(stop.validate(), /Invalid latitude value/);
    });

    it("should accept valid coordinates", async () => {
      const stop = new Stop({
        name: "Test", code: "TST3",
        coordinates: { lat: 27.7172, lng: 85.3240 }
      });
      await assert.doesNotReject(stop.validate());
    });
  });

  describe("Parent Hierarchy Validation", () => {
    it("should reject self-parent assignment", async () => {
      const stop = new Stop({ name: "Self Parent", type: "CITY", code: "SP1" });
      stop._id = new mongoose.Types.ObjectId();
      stop.parentStopId = stop._id;
      await assert.rejects(stop.validate(), /A stop cannot be its own parent/);
    });

    it("should reject cyclic parent references", async () => {
      const parent = await Stop.createWithUniqueCode({ name: "Parent" });
      const child = await Stop.createWithUniqueCode({ name: "Child", parentStopId: parent._id });

      parent.parentStopId = child._id;
      await assert.rejects(parent.validate(), /Parent hierarchy cycle detected/);
    });

    it("should reject non-existent parent assignment", async () => {
      const stop = new Stop({
        name: "Orphan", code: "ORP",
        parentStopId: new mongoose.Types.ObjectId(),
      });
      await assert.rejects(stop.validate(), /Assigned parent stop does not exist/);
    });

    it("should reject inactive parent assignment", async () => {
      const parent = await Stop.createWithUniqueCode({ name: "InactiveParent", status: "INACTIVE" });
      const stop = new Stop({
        name: "Child", code: "CHD",
        parentStopId: parent._id,
      });
      await assert.rejects(stop.validate(), /A stop may only be assigned under an ACTIVE parent/);
    });

    it("should allow null parent", async () => {
      const stop = new Stop({ name: "NullParent", code: "NUL", parentStopId: null });
      await assert.doesNotReject(stop.validate());
    });
  });
});

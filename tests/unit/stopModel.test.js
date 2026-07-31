const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel");
const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");

describe("Stop Registry Model", () => {
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

  describe("Capabilities", () => {
    it("should allow creating a broad searchable place (Kathmandu)", async () => {
      const stop = await Stop.createWithUniqueCode({
        name: "Kathmandu",
        type: "CITY",
        isSearchable: true,
        isRouteStop: false,
      });

      assert.equal(stop.name, "Kathmandu");
      assert.equal(stop.isSearchable, true);
      assert.equal(stop.isRouteStop, false);
      assert.ok(stop.code);
    });

    it("should allow creating a physical child stop (Kalanki)", async () => {
      const parent = await Stop.createWithUniqueCode({
        name: "Kathmandu",
        type: "CITY",
      });

      const child = await Stop.createWithUniqueCode({
        name: "Kalanki",
        type: "JUNCTION",
        isSearchable: true,
        isRouteStop: true,
        parentStopId: parent._id,
      });

      assert.equal(child.parentStopId.toString(), parent._id.toString());
      assert.equal(child.isRouteStop, true);
    });
  });

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

  describe("Deduplication and Context", () => {
    it("should normalize aliases consistently", async () => {
      const stop = await Stop.createWithUniqueCode({
        name: "Pokhara",
        aliases: ["  pokhara  ", "  pkr city  ", "PKR City", ""],
      });

      assert.deepEqual(stop.aliases, ["pkr city"]);
    });

    it("should allow same-name stops if geographic context differs", async () => {
      await Stop.createWithUniqueCode({ name: "Himalaya", district: "District A" });
      const stop2 = await Stop.createWithUniqueCode({ name: "Himalaya", district: "District B" });
      assert.equal(stop2.name, "Himalaya");
    });

    it("should reject exact duplicates in the same geographic context", async () => {
      await Stop.createWithUniqueCode({
        name: "Himalaya", district: "District A", municipality: "Municipality 1"
      });
      await assert.rejects(
        Stop.createWithUniqueCode({
          name: "Himalaya", district: "District A", municipality: "Municipality 1"
        })
      ); // Duplicate key error
    });

    it("missing context determinism - treats missing parent/district/municipality correctly", async () => {
      await Stop.createWithUniqueCode({ name: "Himalaya" });
      // Creating another "Himalaya" with all missing context should clash
      await assert.rejects(Stop.createWithUniqueCode({ name: "Himalaya" }));
    });
  });
});

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel");
const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");

describe("Stop Registry", () => {
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
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
        isSearchable: true,
        isRouteStop: false,
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

  describe("Parent Hierarchy Validation", () => {
    it("should reject self-parent assignment", async () => {
      const stop = new Stop({
        name: "Self Parent",
        type: "CITY",
      });
      // Mocking ID for validation since it needs to exist
      stop._id = new mongoose.Types.ObjectId();
      stop.parentStopId = stop._id;

      await assert.rejects(stop.validate(), /A stop cannot be its own parent/);
    });

    it("should reject cyclic parent references", async () => {
      const parent = await Stop.createWithUniqueCode({
        name: "Parent",
      });

      const child = await Stop.createWithUniqueCode({
        name: "Child",
        parentStopId: parent._id,
      });

      // Attempt to make the parent a child of its child
      parent.parentStopId = child._id;

      await assert.rejects(parent.validate(), /Parent hierarchy cycle detected/);
    });

    it("should reject non-existent parent assignment", async () => {
      const stop = new Stop({
        name: "Orphan",
        parentStopId: new mongoose.Types.ObjectId(), // Non-existent
      });

      await assert.rejects(stop.validate(), /Assigned parent stop does not exist/);
    });
  });

  describe("Deduplication and Context", () => {
    it("should normalize aliases consistently", async () => {
      const stop = await Stop.createWithUniqueCode({
        name: "Pokhara",
        aliases: ["  pokhara  ", "  pkr city  ", "PKR City", ""],
      });

      // "pokhara" is canonical, should be removed
      // "pkr city" and "PKR City" should be deduplicated
      // empty string should be removed
      assert.deepEqual(stop.aliases, ["pkr city"]);
    });

    it("should allow same-name stops if geographic context differs", async () => {
      await Stop.createWithUniqueCode({
        name: "Himalaya",
        district: "District A",
      });

      const stop2 = await Stop.createWithUniqueCode({
        name: "Himalaya",
        district: "District B",
      });

      assert.equal(stop2.name, "Himalaya");
    });

    it("should reject exact duplicates in the same geographic context", async () => {
      await Stop.createWithUniqueCode({
        name: "Himalaya",
        district: "District A",
        municipality: "Municipality 1",
      });

      await assert.rejects(
        Stop.createWithUniqueCode({
          name: "Himalaya",
          district: "District A",
          municipality: "Municipality 1",
        })
      ); // Duplicate key error
    });
  });
});

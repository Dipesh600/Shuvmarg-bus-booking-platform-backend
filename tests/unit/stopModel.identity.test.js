const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../models/stopModel");
const { setupTestDb, teardownTestDb, resetTestDb } = require("../helpers/stop-registry-test-db");

describe("Stop Registry Model - Identity & Deduplication", () => {
  before(setupTestDb);
  after(teardownTestDb);
  afterEach(resetTestDb);

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
      );
    });

    it("missing context determinism - treats missing parent/district/municipality correctly", async () => {
      await Stop.createWithUniqueCode({ name: "Himalaya" });
      await assert.rejects(Stop.createWithUniqueCode({ name: "Himalaya" }));
    });
  });
});

const { test } = require("node:test");
const assert = require("node:assert");

// Testing the service would typically involve mocking the repository, route resolver, query builder, and mapper.
const { createTripDiscoveryService } = require("../../../src/modules/trip-discovery/trip-discovery.service");

test("Trip Discovery Service", async (t) => {
  await t.test("queries legacy routes and returns empty if no IDs resolved", async () => {
    let resolverCalled = false;
    const mockRepo = {};
    const mockResolver = async () => {
      resolverCalled = true;
      return { legacyRouteIds: [], variantIds: [] };
    };
    const mockBuilder = () => ({ isActive: true });
    const mockMapper = async () => [];

    const { searchTripsService } = createTripDiscoveryService({
      resolveRouteCandidates: mockResolver,
      buildTripQuery: mockBuilder,
      countTrips: async () => 0,
      findTripsWithPopulate: async () => [],
      getSeatAvailabilityMap: async () => ({}),
      mapTripResponse: mockMapper
    });
    const result = await searchTripsService({ from: "cityA", to: "cityB", date: "2024-01-01", shift: "day", page: 1, limit: 10 });

    assert.ok(resolverCalled);
    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.data, []);
  });

  await t.test("executes pipeline correctly when IDs resolved", async () => {
    let countCalled = false;
    let findCalled = false;
    let mapperCalled = false;

    const mockResolver = async () => {
      return { legacyRouteIds: ["route1"], variantIds: ["var1"] };
    };
    const mockBuilder = () => ({ isActive: true });
    const mockMapper = async (trips) => {
      mapperCalled = true;
      return trips; // pass through
    };

    const { searchTripsService } = createTripDiscoveryService({
      resolveRouteCandidates: mockResolver,
      buildTripQuery: mockBuilder,
      countTrips: async () => { countCalled = true; return 1; },
      findTripsWithPopulate: async () => { findCalled = true; return [{ _id: "trip1" }]; },
      getSeatAvailabilityMap: async () => ({ "trip1": 15 }),
      mapTripResponse: mockMapper
    });
    const result = await searchTripsService({ from: "cityA", to: "cityB", date: "2024-01-01", shift: "day", page: 1, limit: 10 });

    assert.ok(countCalled);
    assert.ok(findCalled);
    assert.ok(mapperCalled);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.data.length, 1);
  });
});

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");

const { createTripDiscoveryService } = require("../../src/modules/trip-discovery/trip-discovery.service");
const { createRouteResolver } = require("../../src/modules/trip-discovery/trip-discovery-route-resolver");
const { buildTripQuery } = require("../../src/modules/trip-discovery/trip-discovery-query");
const { createTripMapper } = require("../../src/modules/trip-discovery/trip-discovery-mapper");

describe("Trip Discovery Module", () => {
  let repository;
  let service;
  let getPresignedUrl;

  beforeEach(() => {
    repository = {
      findLegacyRoutes: async () => [],
      findStopsByNameOrCode: async () => [],
      findCorridors: async () => ({ fwdCorridors: [], revCorridors: [] }),
      findVariants: async () => ({ fwdVariants: [], revVariants: [] }),
      findRouteStops: async () => ({ originRouteStops: [], destRouteStops: [] }),
      countTrips: async () => 0,
      findTripsWithPopulate: async () => [],
      getSeatAvailabilityMap: async () => ({}),
    };
    
    getPresignedUrl = async (key) => "http://mock-url.com/image.jpg";

    const { resolveRouteCandidates } = createRouteResolver({ repository });
    const { mapTripResponse } = createTripMapper({ getPresignedUrl });
    
    const svc = createTripDiscoveryService({
      resolveRouteCandidates,
      buildTripQuery,
      countTrips: (...args) => repository.countTrips(...args),
      findTripsWithPopulate: (...args) => repository.findTripsWithPopulate(...args),
      getSeatAvailabilityMap: (...args) => repository.getSeatAvailabilityMap(...args),
      mapTripResponse
    });
    service = svc.searchTripsService;
  });

  it("should return empty if no routes found", async () => {
    const result = await service({ from: "A", to: "B", date: "2024-01-01", shift: "day", page: 1, limit: 10 });
    
    assert.strictEqual(result.noRoutes, true);
    assert.strictEqual(result.total, 0);
  });

  it("should build correct query for dates", () => {
    const query = buildTripQuery(["route1"], ["variant1"], "2024-01-01", "day");
    
    assert.strictEqual(query.isActive, true);
    assert.strictEqual(query.status, "scheduled");
    assert.strictEqual(query.shift, "day");
    assert.ok(query.tripDate.$gte instanceof Date);
    assert.ok(query.tripDate.$lte instanceof Date);
    assert.strictEqual(query.$or.length, 2);
  });
  
  it("should resolve candidate routes when found", async () => {
    repository.findLegacyRoutes = async () => [{ _id: "legacy1" }];
    
    const result = await service({ from: "A", to: "B", date: "2024-01-01", shift: "day", page: 1, limit: 10 });
    
    assert.strictEqual(result.noRoutes, false);
  });
  
  it("should process and map returned trips", async () => {
    repository.findLegacyRoutes = async () => [{ _id: "legacy1" }];
    repository.countTrips = async () => 1;
    
    const mockTrip = {
      _id: "trip1",
      tripId: "T1",
      tripDate: "2024-01-01",
      departureTime: "08:00",
      arrivalTime: "12:00",
      tripFare: 500,
      shift: "day",
      status: "scheduled",
      busId: {
        _id: "bus1",
        busName: "Express",
        fleetImages: ["img1.jpg"]
      },
      routeId: {
        _id: "legacy1",
        routeName: "A to B",
        basePrice: 500
      }
    };
    
    repository.findTripsWithPopulate = async () => [mockTrip];
    repository.getSeatAvailabilityMap = async () => ({ "trip1": 40 });
    
    const result = await service({ from: "A", to: "B", date: "2024-01-01", shift: "day", page: 1, limit: 10 });
    
    assert.strictEqual(result.noRoutes, false);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.data.length, 1);
    assert.strictEqual(result.data[0].tripId, "T1");
    assert.strictEqual(result.data[0].availableSeats, 40);
    assert.strictEqual(result.data[0].busDetail.fleetImages[0], "http://mock-url.com/image.jpg");
  });
});

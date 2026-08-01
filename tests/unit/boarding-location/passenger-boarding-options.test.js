"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPassengerBoardingOptionsService,
} = require(
  "../../../src/modules/booking/passenger-boarding-options/passenger-boarding-options.service.js"
);

const tripId = "64b000000000000000000001";
const originStopId = "64b000000000000000000002";
const destinationStopId = "64b000000000000000000003";
const brandId = "64b000000000000000000004";

function makeTrip(overrides = {}) {
  return {
    brandId,
    variantId: { direction: "OUTBOUND" },
    scheduleId: {
      operatorRouteConfigId: {
        status: "ACTIVE",
        activeStops: [originStopId, destinationStopId],
        timingConfig: [
          { stopId: originStopId, estimatedDeparture: "08:00", stopBehavior: "BOTH" },
          { stopId: destinationStopId, estimatedArrival: "12:00", stopBehavior: "BOTH" },
        ],
      },
    },
    ...overrides,
  };
}

function makeRepository({ trip = makeTrip(), assignments = [], children = [] } = {}) {
  return {
    findTripBoardingContext: async () => trip,
    findStops: async () => [
      {
        _id: originStopId, name: "Kalanki", status: "ACTIVE",
        verificationStatus: "VERIFIED", isRouteStop: true,
        coordinates: { lat: 27.69, lng: 85.28 },
      },
      {
        _id: destinationStopId, name: "Pokhara", status: "ACTIVE",
        verificationStatus: "VERIFIED", isRouteStop: true,
        coordinates: { lat: 28.21, lng: 83.98 },
      },
    ],
    findChildStops: async () => children,
    findOperatorAssignments: async () => assignments,
  };
}

test("resolves pickup and drop independently with safe stop fallback", async () => {
  const resolve = createPassengerBoardingOptionsService(makeRepository());
  const result = await resolve({ tripId, originStopId, destinationStopId });
  assert.equal(result.pickupOptions[0].sourceType, "STOP_FALLBACK");
  assert.equal(result.pickupOptions[0].time, "08:00");
  assert.equal(result.dropOptions[0].sourceType, "STOP_FALLBACK");
  assert.equal(result.dropOptions[0].time, "12:00");
});

test("returns an operator assignment instead of the fallback", async () => {
  const locationId = "64b000000000000000000005";
  const assignmentId = "64b000000000000000000006";
  const assignments = [{
    _id: assignmentId, status: "ACTIVE", usage: "PICKUP",
    displayName: "Kalanki Gate",
    boardingLocationId: {
      _id: locationId, stopId: originStopId, name: "Kalanki Chowk",
      status: "ACTIVE", verificationStatus: "VERIFIED",
      coordinates: { lat: 27.691, lng: 85.281 },
    },
  }];
  const resolve = createPassengerBoardingOptionsService(
    makeRepository({ assignments })
  );
  const result = await resolve({ tripId, originStopId, destinationStopId });
  assert.equal(result.pickupOptions[0].name, "Kalanki Gate");
  assert.equal(result.pickupOptions[0].assignmentId, assignmentId);
  assert.equal(result.dropOptions[0].sourceType, "STOP_FALLBACK");
});

test("rejects a stop pair not served by the trip", async () => {
  const trip = makeTrip();
  trip.scheduleId.operatorRouteConfigId.activeStops = [originStopId];
  const resolve = createPassengerBoardingOptionsService(makeRepository({ trip }));
  await assert.rejects(
    resolve({ tripId, originStopId, destinationStopId }),
    { code: "STOP_NOT_SERVED" }
  );
});

test("return trips use their return stop configuration", async () => {
  const trip = makeTrip({
    variantId: { direction: "RETURN" },
    scheduleId: {
      operatorRouteConfigId: {
        status: "ACTIVE",
        activeStops: [],
        returnActiveStops: [originStopId, destinationStopId],
        returnTimingConfig: [
          { stopId: originStopId, estimatedDeparture: "13:00", stopBehavior: "BOTH" },
          { stopId: destinationStopId, estimatedArrival: "17:00", stopBehavior: "BOTH" },
        ],
      },
    },
  });
  const resolve = createPassengerBoardingOptionsService(makeRepository({ trip }));
  const result = await resolve({ tripId, originStopId, destinationStopId });
  assert.equal(result.pickupOptions[0].time, "13:00");
  assert.equal(result.dropOptions[0].time, "17:00");
});

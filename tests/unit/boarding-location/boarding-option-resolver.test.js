"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveBoardingOptions,
} = require(
  "../../../src/domain/boarding-location/boarding-option-resolver.js"
);

const stop = {
  _id: "stop-1", name: "Mugling", status: "ACTIVE",
  verificationStatus: "VERIFIED", isRouteStop: true,
  coordinates: { lat: 27.856, lng: 84.558 },
};

function option(overrides = {}) {
  return {
    _id: "assignment-1", status: "ACTIVE", usage: "BOTH",
    boardingLocationId: {
      _id: "location-1", stopId: "stop-1", name: "Mugling Bus Park",
      status: "ACTIVE", verificationStatus: "VERIFIED",
      coordinates: { lat: 27.857, lng: 84.559 },
    },
    ...overrides,
  };
}

test("trip options override service and operator defaults", () => {
  const result = resolveBoardingOptions({
    stop, usage: "PICKUP",
    tripOptions: [option({ displayName: "Trip gate" })],
    serviceOptions: [option({ displayName: "Service gate" })],
    operatorOptions: [option({ displayName: "Operator gate" })],
  });
  assert.equal(result[0].sourceLayer, "TRIP");
  assert.equal(result[0].name, "Trip gate");
});

test("pickup and drop capability are resolved independently", () => {
  const pickupOnly = option({ usage: "PICKUP" });
  const pickup = resolveBoardingOptions({
    stop, usage: "PICKUP", operatorOptions: [pickupOnly],
  });
  const dropping = resolveBoardingOptions({
    stop, usage: "DROP", operatorOptions: [pickupOnly],
  });
  assert.equal(pickup[0].sourceType, "BOARDING_LOCATION");
  assert.equal(dropping[0].sourceType, "STOP_FALLBACK");
});

test("route stop becomes fallback without a duplicate location record", () => {
  const result = resolveBoardingOptions({ stop, usage: "PICKUP" });
  assert.deepEqual(result, [{
    sourceType: "STOP_FALLBACK", sourceLayer: "STOP", usage: "PICKUP",
    stopId: "stop-1", boardingLocationId: null, assignmentId: null,
    name: "Mugling", canonicalName: "Mugling", landmark: null,
    address: null,
    reportingInstructions: "Board at the registered stop location.",
    coordinates: { lat: 27.856, lng: 84.558 },
  }]);
});

test("fallback fails closed when the route stop has no valid map position", () => {
  assert.throws(
    () => resolveBoardingOptions({
      stop: { ...stop, coordinates: { lat: null, lng: null } },
      usage: "DROP",
    }),
    { code: "BOARDING_CONFIGURATION_MISSING" }
  );
});

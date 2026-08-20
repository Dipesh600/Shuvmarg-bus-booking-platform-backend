"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateEndpoints,
  validateCoordinates,
  validateCustomBoardingPoints,
  sanitizeText,
} = require("../../../src/modules/bus-owner/fleet-route-setup/route-setup.validation.js");

test("validateEndpoints accepts valid canonical endpoints", () => {
  assert.doesNotThrow(() => {
    validateEndpoints({
      originStopId: "64f000000000000000000001",
      destinationStopId: "64f000000000000000000002",
    });
  });
});

test("validateEndpoints accepts custom origin and destination", () => {
  assert.doesNotThrow(() => {
    validateEndpoints({
      customOrigin: { name: "Bhaise Bazar", coordinates: { lat: 27.5, lng: 85.1 } },
      customDestination: { name: "Tamghas", coordinates: { lat: 28.1, lng: 83.2 } },
    });
  });
});

test("validateEndpoints rejects missing origin or destination", () => {
  assert.throws(() => {
    validateEndpoints({
      destinationStopId: "64f000000000000000000002",
    });
  }, { code: "ORIGIN_REQUIRED" });

  assert.throws(() => {
    validateEndpoints({
      originStopId: "64f000000000000000000001",
    });
  }, { code: "DESTINATION_REQUIRED" });
});

test("validateEndpoints rejects identical canonical origin and destination", () => {
  assert.throws(() => {
    validateEndpoints({
      originStopId: "64f000000000000000000001",
      destinationStopId: "64f000000000000000000001",
    });
  }, { code: "INVALID_ROUTE_ENDPOINTS" });
});

test("validateCoordinates rejects invalid lat/lng values", () => {
  assert.throws(() => {
    validateCoordinates({ lat: 95, lng: 85 });
  }, { code: "INVALID_COORDINATES" });

  assert.throws(() => {
    validateCoordinates({ lat: 27, lng: 200 });
  }, { code: "INVALID_COORDINATES" });

  assert.equal(validateCoordinates(null), null);
  assert.deepEqual(validateCoordinates({ lat: 27.7, lng: 85.3 }), { lat: 27.7, lng: 85.3 });
});

test("validateCustomBoardingPoints validates and sanitizes operator counters", () => {
  const points = [
    {
      clientKey: "cp-1",
      name: "  Gongabu Counter 4  ",
      counterNumber: "4",
      contactName: "Ram",
      contactPhone: "9800000000",
      coordinates: { lat: 27.73, lng: 85.31 },
    },
  ];

  const sanitized = validateCustomBoardingPoints(points);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].name, "Gongabu Counter 4");
  assert.equal(sanitized[0].counterNumber, "4");
  assert.equal(sanitized[0].contactName, "Ram");
  assert.deepEqual(sanitized[0].coordinates, { lat: 27.73, lng: 85.31 });
});

test("validateCustomBoardingPoints rejects duplicate clientKeys or empty names", () => {
  assert.throws(() => {
    validateCustomBoardingPoints([
      { clientKey: "cp-1", name: "" },
    ]);
  }, { code: "INVALID_CUSTOM_BOARDING_POINT" });

  assert.throws(() => {
    validateCustomBoardingPoints([
      { clientKey: "cp-1", name: "Counter 1" },
      { clientKey: "cp-1", name: "Counter 2" },
    ]);
  }, { code: "DUPLICATE_CUSTOM_BOARDING_POINT" });
});

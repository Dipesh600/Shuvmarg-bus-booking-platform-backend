"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../../models/stopModel.js");
const BoardingLocation = require(
  "../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../models/operatorBoardingAssignmentModel.js"
);
const service = require(
  "../../../src/modules/admin/platform-registry/boarding-location/boarding-location.service.js"
);
const {
  distanceMeters,
} = require(
  "../../../src/modules/admin/platform-registry/boarding-location/boarding-location-nearby.service.js"
);

function patch(t, object, key, replacement) {
  const original = object[key];
  object[key] = replacement;
  t.after(() => { object[key] = original; });
}

function stopQuery(stop) {
  return { async lean() { return stop; } };
}

function nearbyQuery(results = []) {
  return {
    populate() { return this; },
    limit() { return this; },
    async lean() { return results; },
  };
}

test("admin creates canonical physical facts without global usage", async (t) => {
  const stop = {
    _id: "stop-1", name: "Kalanki", code: "KLK",
    status: "ACTIVE", isRouteStop: true,
  };
  let createPayload;
  patch(t, Stop, "findOne", () => stopQuery(stop));
  patch(t, BoardingLocation, "find", () => nearbyQuery());
  patch(t, BoardingLocation, "create", async (payload) => {
    createPayload = payload;
    return {
      _id: "location-1", ...payload,
      async populate() { this.stopId = stop; },
    };
  });
  const result = await service.createBoardingLocation({
    stopId: "507f1f77bcf86cd799439011",
    name: "Kalanki Chowk",
    coordinates: { lat: 27.693, lng: 85.281 },
    usage: "PICKUP",
  }, "admin-1");
  assert.equal(createPayload.name, "Kalanki Chowk");
  assert.equal(createPayload.verificationStatus, "VERIFIED");
  assert.equal(Object.hasOwn(createPayload, "usage"), false);
  assert.equal(Object.hasOwn(createPayload, "contactPhone"), false);
  assert.equal(result.location.stop.name, "Kalanki");
  assert.deepEqual(result.nearbyWarnings, []);
});

test("boarding location requires an active operational route stop", async (t) => {
  patch(t, Stop, "findOne", () => stopQuery({
    _id: "stop-1", status: "ACTIVE", isRouteStop: false,
  }));
  await assert.rejects(
    service.createBoardingLocation({
      stopId: "507f1f77bcf86cd799439011",
      name: "City centre",
      coordinates: { lat: 27.7, lng: 85.3 },
    }),
    { code: "INVALID_BOARDING_LOCATION_STOP" }
  );
});

test("identity duplicates become stable conflict errors", async (t) => {
  patch(t, Stop, "findOne", () => stopQuery({
    _id: "stop-1", status: "ACTIVE", isRouteStop: true,
  }));
  patch(t, BoardingLocation, "find", () => nearbyQuery());
  patch(t, BoardingLocation, "create", async () => {
    const error = new Error("E11000 internal details");
    error.code = 11000;
    throw error;
  });
  await assert.rejects(
    service.createBoardingLocation({
      stopId: "507f1f77bcf86cd799439011",
      name: "Kalanki Chowk",
      coordinates: { lat: 27.693, lng: 85.281 },
    }),
    {
      code: "BOARDING_LOCATION_IDENTITY_CONFLICT",
      message: "A boarding location with this name already exists under the route stop.",
    }
  );
});

test("nearby warning distance is calculated from map coordinates", () => {
  const distance = distanceMeters(
    { lat: 27.693, lng: 85.281 },
    { lat: 27.6935, lng: 85.281 }
  );
  assert.ok(distance > 50 && distance < 60);
});

test("active operator assignment blocks location deactivation", async (t) => {
  patch(t, BoardingLocation, "findById", async () => ({
    _id: "location-1", status: "ACTIVE", async save() {},
  }));
  patch(t, Assignment, "countDocuments", async () => 2);
  await assert.rejects(
    service.deactivateBoardingLocation("507f1f77bcf86cd799439011"),
    {
      code: "BOARDING_LOCATION_IN_USE",
      details: { assignmentCount: 2 },
    }
  );
});

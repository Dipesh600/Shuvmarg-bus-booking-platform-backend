"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Stop = require("../../../models/stopModel.js");
const BoardingLocation = require(
  "../../../models/boardingLocationModel.js"
);
const service = require(
  "../../../src/modules/admin/platform-registry/boarding-location/boarding-location.service.js"
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
  assert.equal(createPayload.verificationStatus, "PENDING");
  assert.equal(createPayload.coordinateSource, "MAP_PIN");
  assert.equal(Object.hasOwn(createPayload, "usage"), false);
  assert.equal(Object.hasOwn(createPayload, "contactPhone"), false);
  assert.equal(result.location.stop.name, "Kalanki");
  assert.deepEqual(result.nearbyWarnings, []);
});

test("verified creation records desk verification audit", async (t) => {
  const stop = {
    _id: "stop-1", name: "Kalanki", code: "KLK",
    status: "ACTIVE", isRouteStop: true,
  };
  let createPayload;
  patch(t, Stop, "findOne", () => stopQuery(stop));
  patch(t, BoardingLocation, "find", () => nearbyQuery());
  patch(t, BoardingLocation, "create", async (payload) => {
    createPayload = payload;
    return { _id: "location-1", ...payload, async populate() { this.stopId = stop; } };
  });
  await service.createBoardingLocation({
    stopId: "507f1f77bcf86cd799439011",
    name: "Kalanki Chowk",
    coordinates: { lat: 27.693, lng: 85.281 },
    verificationStatus: "VERIFIED",
    verificationMethod: "DESK_MAP",
  }, "507f1f77bcf86cd799439012");
  assert.equal(createPayload.verificationMethod, "DESK_MAP");
  assert.equal(String(createPayload.verifiedBy), "507f1f77bcf86cd799439012");
  assert.ok(createPayload.verifiedAt instanceof Date);
});

test("nearby match requires explicit review before creation", async (t) => {
  patch(t, Stop, "findOne", () => stopQuery({
    _id: "stop-1", status: "ACTIVE", isRouteStop: true,
  }));
  patch(t, BoardingLocation, "find", () => nearbyQuery([{
    _id: "location-2", stopId: "stop-1", name: "Existing Bay",
    coordinates: { lat: 27.6931, lng: 85.281 }, status: "ACTIVE",
  }]));
  await assert.rejects(service.createBoardingLocation({
    stopId: "507f1f77bcf86cd799439011",
    name: "New Bay", coordinates: { lat: 27.693, lng: 85.281 },
  }), { code: "BOARDING_LOCATION_NEARBY_REVIEW_REQUIRED" });
});

test("nearby review requires a reason and is stored for audit", async (t) => {
  const stop = { _id: "stop-1", name: "Kalanki", code: "KLK", status: "ACTIVE", isRouteStop: true };
  const nearbyLocation = {
    _id: "location-2", stopId: "stop-1", name: "Existing Bay",
    coordinates: { lat: 27.6931, lng: 85.281 }, status: "ACTIVE",
  };
  let createPayload;
  patch(t, Stop, "findOne", () => stopQuery(stop));
  patch(t, BoardingLocation, "find", () => nearbyQuery([nearbyLocation]));
  patch(t, BoardingLocation, "create", async (payload) => {
    createPayload = payload;
    return { _id: "location-3", ...payload, async populate() { this.stopId = stop; } };
  });
  await assert.rejects(service.createBoardingLocation({
    stopId: "507f1f77bcf86cd799439011", name: "New Bay",
    coordinates: { lat: 27.693, lng: 85.281 },
    nearbyReview: { acknowledged: true, reason: "" },
  }), { code: "BOARDING_LOCATION_NEARBY_REVIEW_REQUIRED" });
  await service.createBoardingLocation({
    stopId: "507f1f77bcf86cd799439011", name: "New Bay",
    coordinates: { lat: 27.693, lng: 85.281 },
    nearbyReview: { acknowledged: true, reason: "Opposite side of road" },
  }, "507f1f77bcf86cd799439012");
  assert.equal(createPayload.nearbyReview.reason, "Opposite side of road");
  assert.ok(createPayload.nearbyReview.reviewedAt instanceof Date);
});

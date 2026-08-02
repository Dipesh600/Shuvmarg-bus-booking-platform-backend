"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const {
  buildMigrationCandidate,
} = require(
  "../../../src/modules/admin/platform-registry/boarding-location-migration/migration-candidate.js"
);

function stop(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(), name: "Mugling",
    status: "ACTIVE", isRouteStop: true,
    coordinates: { lat: 27.856, lng: 84.558 },
    ...overrides,
  };
}

test("discovery point identical to its stop is treated as fallback", () => {
  const parent = stop();
  const candidate = buildMigrationCandidate({
    _id: new mongoose.Types.ObjectId(), stopId: parent,
    name: "Mugling", source: "DISCOVERY", status: "ACTIVE",
    coordinates: { ...parent.coordinates },
  }, "StopPoint");
  assert.equal(candidate.syntheticFallback, true);
});

test("real legacy stop point becomes a canonical physical location", () => {
  const parent = stop();
  const sourceId = new mongoose.Types.ObjectId();
  const candidate = buildMigrationCandidate({
    _id: sourceId, stopId: parent, name: "Mugling Bus Park",
    nameNe: "मुग्लिन बस पार्क", source: "MANUAL", status: "ACTIVE",
    coordinates: { lat: 27.857, lng: 84.559 },
  }, "StopPoint");
  assert.equal(candidate.syntheticFallback, false);
  assert.equal(candidate.locationData.name, "Mugling Bus Park");
  assert.deepEqual(candidate.locationData.aliases, ["मुग्लिन बस पार्क"]);
  assert.deepEqual(candidate.locationData.legacySource, {
    model: "StopPoint", id: sourceId,
  });
});

test("private legacy point becomes pending operator-owned candidate", () => {
  const ownerId = new mongoose.Types.ObjectId();
  const candidate = buildMigrationCandidate({
    _id: new mongoose.Types.ObjectId(), stopId: stop(),
    pointName: "Counter 4", isGlobal: false, ownerId,
    contactNumber: "9800000000", type: "BOARDING", status: true,
    coordinates: { lat: 27.857, lng: 84.559 },
  }, "BoardingPoints");
  assert.equal(String(candidate.ownerId), String(ownerId));
  assert.equal(candidate.usage, "PICKUP");
  assert.equal(candidate.contactPhone, "9800000000");
  assert.equal(candidate.locationData.verificationStatus, "PENDING");
  assert.equal(candidate.locationData.source, "OPERATOR_REQUEST");
});

test("legacy point without usable coordinates is rejected", () => {
  assert.throws(
    () => buildMigrationCandidate({
      _id: new mongoose.Types.ObjectId(), stopId: stop(),
      pointName: "Unknown", isGlobal: true,
      coordinates: { lat: null, lng: null },
    }, "BoardingPoints"),
    { code: "INVALID_BOARDING_LOCATION_COORDINATES" }
  );
});

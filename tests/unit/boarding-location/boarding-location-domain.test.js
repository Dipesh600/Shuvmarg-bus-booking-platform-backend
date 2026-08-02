"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const BoardingLocation = require(
  "../../../models/boardingLocationModel.js"
);
const Assignment = require(
  "../../../models/operatorBoardingAssignmentModel.js"
);
const {
  buildBoardingLocationIdentity,
} = require(
  "../../../src/domain/boarding-location/boarding-location-identity.js"
);

test("boarding identity is scoped to route stop and normalized name", () => {
  const stopId = new mongoose.Types.ObjectId();
  assert.equal(
    buildBoardingLocationIdentity({ stopId, name: " Kalanki   Chowk " }),
    `${stopId}:kalanki chowk`
  );
  assert.notEqual(
    buildBoardingLocationIdentity({
      stopId: new mongoose.Types.ObjectId(), name: "Kalanki Chowk",
    }),
    `${stopId}:kalanki chowk`
  );
});

test("boarding location prepares geo identity and normalized aliases", async () => {
  const stopId = new mongoose.Types.ObjectId();
  const location = new BoardingLocation({
    stopId,
    name: "Kalanki Chowk",
    aliases: [" Kalanki ", "kalanki", "Kalanki Chowk", ""],
    coordinates: { lat: "27.693", lng: "85.281" },
    coordinateSource: "GOOGLE_PLACE",
    providerMetadata: {
      provider: "GOOGLE", placeId: "google-place-1",
      suggestedAddress: "Kalanki, Kathmandu",
    },
  });
  await location.validate();
  assert.equal(location._normalizedIdentity, `${stopId}:kalanki chowk`);
  assert.deepEqual(location.aliases, ["Kalanki"]);
  assert.deepEqual(location.coordinates.toObject(), {
    lat: 27.693, lng: 85.281,
  });
  assert.deepEqual(location.geo.coordinates, [85.281, 27.693]);
  assert.equal(location.coordinateSource, "GOOGLE_PLACE");
  assert.equal(location.providerMetadata.placeId, "google-place-1");
});

test("boarding location requires complete valid map coordinates", async () => {
  const base = {
    stopId: new mongoose.Types.ObjectId(), name: "Kalanki Chowk",
  };
  for (const coordinates of [
    { lat: null, lng: 85 },
    { lat: 91, lng: 85 },
    { lat: 27, lng: -181 },
  ]) {
    await assert.rejects(
      new BoardingLocation({ ...base, coordinates }).validate(),
      { code: "INVALID_BOARDING_LOCATION_COORDINATES" }
    );
  }
});

test("operator assignment owns usage and instructions", async () => {
  const assignment = new Assignment({
    brandId: new mongoose.Types.ObjectId(),
    boardingLocationId: new mongoose.Types.ObjectId(),
    usage: "PICKUP",
    reportingInstructions: "Wait at counter 4",
  });
  await assignment.validate();
  assert.equal(assignment.usage, "PICKUP");
  assert.equal(assignment.status, "PENDING_REVIEW");
  assert.equal(assignment.reportingInstructions, "Wait at counter 4");
});

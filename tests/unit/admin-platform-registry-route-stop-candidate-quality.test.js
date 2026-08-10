"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRouteStopCandidates,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-stop-candidate.service.js");

const emptyStopModel = {
  find() {
    return { select() { return { lean: async () => [] }; } };
  },
};

test("off-road endpoint transit evidence never becomes a route-stop suggestion", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "kathmandu", name: "Kathmandu", coordinates: { lat: 27.7, lng: 85.3 } },
    destinationAnchor: { _id: "malangwa", name: "Malangwa", coordinates: { lat: 27.7, lng: 87.3 } },
    selectedRouteOption: { distanceMeters: 202100, durationSeconds: 19860 },
    polyline: [[85.3, 27.7], [87.3, 27.7]],
  }, {
    StopModel: emptyStopModel,
    discoverPlaces: async () => [{
      candidateName: "Sankhu Bus Park",
      candidateCoordinates: { lat: 27.825, lng: 85.45 },
      source: "SEARCH_ALONG_ROUTE",
    }, {
      candidateName: "Road Locality",
      candidateCoordinates: { lat: 27.7, lng: 86.3 },
      source: "REVERSE_GEOCODE",
    }],
  });

  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName.includes("Sankhu")
  ), false);
  assert.ok(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName === "Road Locality" &&
    candidate.classification.entityType === "SERVICE_AREA"
  ));
  assert.match(result.warnings[0], /incomplete coverage/i);
});

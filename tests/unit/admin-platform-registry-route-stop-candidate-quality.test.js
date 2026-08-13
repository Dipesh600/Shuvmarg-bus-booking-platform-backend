"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const RouteVariantStopCandidate = require("../../models/routeVariantStopCandidateModel.js");
const {
  buildRouteStopCandidates,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-stop-candidate.service.js");

const emptyStopModel = {
  find() {
    return { select() { return { lean: async () => [] }; } };
  },
};

test("canonical identity evidence survives candidate schema validation", () => {
  const candidate = new RouteVariantStopCandidate({
    mapReviewId: new mongoose.Types.ObjectId(),
    variantId: new mongoose.Types.ObjectId(),
    sequence: 1,
    providerSnapshot: { provider: "GOOGLE_PLACES", displayName: "Hetauda" },
    classification: {
      entityType: "ROUTE_STOP", confidence: "HIGH",
      reasonCodes: ["REPEATED_ROUTE_LOCALITY_OBSERVATION", "CANONICAL_IDENTITY_MATCH"],
    },
    coordinates: { lat: 27.4, lng: 85.03 },
    expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(candidate.validateSync(), undefined);
});

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
      observationCount: 3,
      googleTypes: ["locality"],
    }],
  });

  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName.includes("Sankhu")
  ), false);
  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName === "Road Locality" &&
    candidate.classification.entityType === "SERVICE_AREA"
  ), false);
  assert.match(result.warnings[0], /incomplete coverage/i);
});

test("one-off reverse-geocode labels are rejected instead of becoming route stops", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "origin", name: "Origin", coordinates: { lat: 27, lng: 85 } },
    destinationAnchor: { _id: "destination", name: "Destination", coordinates: { lat: 27, lng: 86 } },
    selectedRouteOption: { distanceMeters: 111000, durationSeconds: 12000 },
    polyline: [[85, 27], [86, 27]],
  }, {
    StopModel: emptyStopModel,
    discoverPlaces: async () => [{
      candidateName: "Incidental Ward Label",
      candidateCoordinates: { lat: 27, lng: 85.5 },
      source: "REVERSE_GEOCODE",
      observationCount: 1,
      googleTypes: ["administrative_area_level_4"],
    }],
  });

  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName === "Incidental Ward Label"
  ), false);
});

test("one-off on-road passenger localities remain reviewable in the dense endpoint zone", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "kathmandu", name: "Kathmandu", coordinates: { lat: 27, lng: 85 } },
    destinationAnchor: { _id: "birgunj", name: "Birgunj", coordinates: { lat: 27, lng: 86.2 } },
    selectedRouteOption: { distanceMeters: 120000, durationSeconds: 12000 },
    polyline: [[85, 27], [86.2, 27]],
  }, {
    StopModel: emptyStopModel,
    discoverPlaces: async () => [{
      candidateName: "Balkhu", candidateCoordinates: { lat: 27, lng: 85.035 },
      source: "REVERSE_GEOCODE", observationCount: 1, googleTypes: ["neighborhood"],
      administrativeContext: { district: "Kathmandu", municipality: "Kathmandu" },
    }, {
      candidateName: "Kirtipur", candidateCoordinates: { lat: 27, lng: 85.09 },
      source: "REVERSE_GEOCODE", observationCount: 1, googleTypes: ["locality"],
      administrativeContext: { district: "Kathmandu", municipality: "Kirtipur" },
    }],
  });

  const routeStops = result.candidates.filter((candidate) =>
    candidate.classification.entityType === "SERVICE_AREA"
  );
  assert.deepEqual(routeStops.map((candidate) => candidate.providerSnapshot.displayName), [
    "Balkhu", "Kirtipur",
  ]);
  assert.ok(routeStops.every((candidate) =>
    candidate.classification.coverageZone === "ORIGIN_40KM"
  ));
});

test("canonical identity is reused only when the road scan independently observes the locality", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "origin", name: "Origin", coordinates: { lat: 27, lng: 85 } },
    destinationAnchor: { _id: "destination", name: "Destination", coordinates: { lat: 27, lng: 86 } },
    selectedRouteOption: { distanceMeters: 111000, durationSeconds: 12000 },
    polyline: [[85, 27], [86, 27]],
  }, {
    StopModel: {
      find() {
        return { select() { return { lean: async () => [{
          _id: "amlekhganj", name: "Amlekhganj", district: "Bara",
          municipality: "Jitpur Simara", coordinates: { lat: 27, lng: 85.4 },
        }] }; } };
      },
    },
    discoverPlaces: async () => [{
      candidateName: "Amlekhganj", candidateCoordinates: { lat: 27, lng: 85.405 },
      source: "REVERSE_GEOCODE", observationCount: 4, googleTypes: ["locality"],
    }],
  });

  const matches = result.candidates.filter((candidate) =>
    candidate.providerSnapshot.displayName === "Amlekhganj"
  );
  assert.equal(matches.length, 1);
  assert.equal(String(matches[0].matchedStopId), "amlekhganj");
  assert.ok(matches[0].classification.reasonCodes.includes("CANONICAL_IDENTITY_MATCH"));
});

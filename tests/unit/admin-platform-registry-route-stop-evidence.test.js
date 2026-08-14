"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRouteStopCandidates,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-stop-candidate.service.js");

const routeInput = {
  originAnchor: { _id: "origin", name: "Origin", coordinates: { lat: 27, lng: 85 } },
  destinationAnchor: { _id: "destination", name: "Destination", coordinates: { lat: 27, lng: 86 } },
  selectedRouteOption: { distanceMeters: 111000, durationSeconds: 12000 },
  polyline: [[85, 27], [86, 27]],
};

test("nearby canonical registry records do not become route candidates without route evidence", async () => {
  const result = await buildRouteStopCandidates(routeInput, {
    StopModel: {
      find() {
        return { select() { return { lean: async () => [{
          _id: "near-road", name: "Near Road", coordinates: { lat: 27, lng: 85.5 },
          status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
        }] }; } };
      },
    },
    discoverPlaces: async () => [],
  });
  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName === "Near Road"
  ), false);
});

test("transit evidence yields a cleaned locality without promoting the bus stand", async () => {
  const result = await buildRouteStopCandidates(routeInput, {
    StopModel: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    discoverPlaces: async () => [{
      candidateName: "Sano Bharyang Bus Stop",
      candidateCoordinates: { lat: 27, lng: 85.1 },
      source: "SEARCH_ALONG_ROUTE", googleTypes: ["bus_station"],
    }],
  });
  const locality = result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Sano Bharyang"
  );
  const boardingEvidence = result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Sano Bharyang Bus Stop"
  );
  assert.equal(locality.classification.entityType, "SERVICE_AREA");
  assert.ok(locality.classification.reasonCodes.includes("TRANSIT_PLACE_SERVICE_AREA_INFERENCE"));
  assert.equal(boardingEvidence.classification.entityType, "BOARDING_LOCATION");
  assert.equal(boardingEvidence.reviewStatus, "EXCLUDE");
});

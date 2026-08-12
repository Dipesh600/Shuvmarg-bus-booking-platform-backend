"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRouteStopCandidates,
} = require("../../src/modules/admin/platform-registry/variant-map-review/route-stop-candidate.service.js");
const {
  buildCandidateWrites,
} = require("../../src/modules/admin/platform-registry/variant-map-review/variant-map-review.validation.js");
const {
  mapVariantDraft,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow.mapper.js");
const {
  assertCandidatesReady,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/commit-policy.service.js");
const {
  isSafeBulkExistingCandidate,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/candidate-bulk-review.service.js");

function stopModel(stops) {
  return {
    find() {
      return { select() { return { lean: async () => stops }; } };
    },
  };
}

test("bulk existing-stop review only accepts high-confidence canonical route-stop matches", () => {
  const base = {
    isTerminal: false,
    reviewStatus: "UNREVIEWED",
    matchedStopId: "canonical-stop",
    classification: { entityType: "ROUTE_STOP", confidence: "HIGH" },
  };
  assert.equal(isSafeBulkExistingCandidate(base), true);
  assert.equal(isSafeBulkExistingCandidate({ ...base, isTerminal: true }), false);
  assert.equal(isSafeBulkExistingCandidate({ ...base, matchedStopId: null }), false);
  assert.equal(isSafeBulkExistingCandidate({
    ...base, classification: { entityType: "SERVICE_AREA", confidence: "HIGH" },
  }), false);
  assert.equal(isSafeBulkExistingCandidate({
    ...base, classification: { entityType: "ROUTE_STOP", confidence: "MEDIUM" },
  }), false);
});

test("candidate review locks terminals and requires road evidence before offering registry reuse", async () => {
  const origin = { _id: "origin", name: "Kalanki", coordinates: { lat: 27, lng: 85 } };
  const destination = { _id: "destination", name: "Malangwa Bus Park", coordinates: { lat: 27, lng: 85.1 } };
  const result = await buildRouteStopCandidates({
    originTerminal: origin,
    destinationTerminal: destination,
    selectedRouteOption: { distanceMeters: 12000, durationSeconds: 1800 },
    polyline: [[85, 27], [85.1, 27]],
  }, {
    StopModel: stopModel([{
      _id: "registry-stop", code: "NWL", name: "Nawalpur Chowk",
      status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
      district: "Sarlahi", coordinates: { lat: 27, lng: 85.03 },
    }]),
    discoverPlaces: async () => [{
      candidateName: "Haripur", candidateCoordinates: { lat: 27, lng: 85.07 }, googlePlaceId: "place-locality",
      source: "REVERSE_GEOCODE", observationCount: 3, googleTypes: ["locality"],
    }, {
      candidateName: "Haripur Bus Station", candidateCoordinates: { lat: 27, lng: 85.0701 }, googlePlaceId: "place-1",
      source: "SEARCH_ALONG_ROUTE", googleTypes: ["bus_station"],
    }],
  });

  assert.equal(result.candidates[0].isTerminal, true);
  assert.equal(result.candidates[0].reviewStatus, "USE_EXISTING");
  assert.equal(String(result.candidates[0].resolvedStopId), "origin");
  assert.equal(result.candidates.at(-1).isTerminal, true);
  assert.equal(result.candidates.at(-1).reviewStatus, "USE_EXISTING");
  assert.equal(result.candidates.some((candidate) => String(candidate.matchedStopId) === "registry-stop"), false);
  const serviceArea = result.candidates.find((candidate) => candidate.providerSnapshot.displayName === "Haripur");
  const transitPlace = result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Haripur Bus Station"
  );
  assert.equal(transitPlace.classification.entityType, "BOARDING_LOCATION");
  assert.equal(transitPlace.classification.confidence, "LOW");
  assert.equal(serviceArea.classification.entityType, "SERVICE_AREA");
  assert.deepEqual(result.candidates.map((candidate) => candidate.sequence), [1, 2, 3, 4]);
});

test("road-path candidate review can start from corridor endpoint anchors without preselected terminals", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: {
      _id: "janakpur", name: "Janakpur", coordinates: { lat: 27, lng: 85 },
      status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: false,
    },
    destinationAnchor: {
      _id: "kathmandu", name: "Kathmandu", coordinates: { lat: 27, lng: 85.1 },
      status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: false,
    },
    selectedRouteOption: { distanceMeters: 250000, durationSeconds: 30000 },
    polyline: [[85, 27], [85.1, 27]],
  }, {
    StopModel: stopModel([{
      _id: "route-stop-1", code: "BDW", name: "Bardibas",
      district: "Mahottari", coordinates: { lat: 27, lng: 85.03 },
    }, {
      _id: "route-stop-2", code: "KAL", name: "Kalanki",
      district: "Kathmandu", coordinates: { lat: 27, lng: 85.07 },
    }]),
    discoverPlaces: async () => [{
      candidateName: "Bardibas", candidateCoordinates: { lat: 27, lng: 85.03 },
      source: "REVERSE_GEOCODE", observationCount: 4, googleTypes: ["locality"],
    }, {
      candidateName: "Kalanki", candidateCoordinates: { lat: 27, lng: 85.07 },
      source: "REVERSE_GEOCODE", observationCount: 4, googleTypes: ["sublocality"],
    }],
  });

  assert.equal(result.candidates.some((candidate) => candidate.isTerminal), false);
  assert.deepEqual(result.candidates.map((candidate) => candidate.providerSnapshot.displayName), [
    "Bardibas", "Kalanki",
  ]);
  assert.doesNotThrow(() => assertCandidatesReady(result.candidates.map((candidate) => ({
    ...candidate, _id: candidate.providerSnapshot.displayName,
    resolvedStopId: candidate.matchedStopId, reviewStatus: "USE_EXISTING",
  })), { originTerminalStopId: null, destinationTerminalStopId: null }));
});

test("candidate engine suppresses repeated corridor endpoint observations", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: {
      _id: "kathmandu", name: "Kathmandu", coordinates: { lat: 27.7, lng: 85.3 },
      status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: false,
    },
    destinationAnchor: {
      _id: "birgunj", name: "Birgunj", coordinates: { lat: 27, lng: 84.9 },
      status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: false,
    },
    selectedRouteOption: { distanceMeters: 140000, durationSeconds: 15000 },
    polyline: [[85.3, 27.7], [84.9, 27]],
  }, {
    StopModel: stopModel([]),
    discoverPlaces: async () => [{
      candidateName: "Kathmandu", candidateCoordinates: { lat: 27.69, lng: 85.29 },
    }, {
      candidateName: "Hetauda", candidateCoordinates: { lat: 27.42, lng: 85.14 },
      source: "REVERSE_GEOCODE", observationCount: 4, googleTypes: ["locality"],
    }, {
      candidateName: "Birgunj", candidateCoordinates: { lat: 27.01, lng: 84.9 },
    }],
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.providerSnapshot.displayName), ["Hetauda"]);
});

test("distance alone never auto-matches a Google observation to a differently named stop", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "origin", name: "Origin", coordinates: { lat: 27, lng: 85 } },
    destinationAnchor: { _id: "destination", name: "Destination", coordinates: { lat: 27, lng: 85.1 } },
    selectedRouteOption: { distanceMeters: 12000, durationSeconds: 1800 },
    polyline: [[85, 27], [85.1, 27]],
  }, {
    StopModel: stopModel([{
      _id: "existing", name: "Existing Bus Park", coordinates: { lat: 27, lng: 85.05 },
    }]),
    discoverPlaces: async () => [{
      candidateName: "Nearby Bazaar Bus Stop", candidateCoordinates: { lat: 27, lng: 85.0501 },
      source: "SEARCH_ALONG_ROUTE", googleTypes: ["bus_station"],
    }],
  });
  const suggestion = result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Nearby Bazaar Bus Stop"
  );
  assert.equal(suggestion.matchedStopId, null);
  assert.equal(suggestion.classification.entityType, "BOARDING_LOCATION");
  assert.equal(suggestion.classification.suggestedParentStopId, null);
  assert.equal(suggestion.reviewStatus, "EXCLUDE");
});

test("a Google bus stand recovers its canonical locality without becoming a second route stop", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "kathmandu", name: "Kathmandu", coordinates: { lat: 27.72, lng: 85.31 } },
    destinationAnchor: { _id: "malangwa", name: "Malangwa", coordinates: { lat: 27.70, lng: 85.38 } },
    selectedRouteOption: { distanceMeters: 10000, durationSeconds: 1200 },
    polyline: [[85.31, 27.72], [85.38, 27.70]],
  }, {
    StopModel: stopModel([{
      _id: "koteshwar", code: "KTW", name: "Koteshwar", aliases: ["Koteshwor"],
      coordinates: { lat: 27.709, lng: 85.349 },
    }]),
    discoverPlaces: async () => [{
      candidateName: "Koteshwar", candidateCoordinates: { lat: 27.709, lng: 85.349 },
      formattedAddress: "Koteshwar, Kathmandu", googleTypes: ["sublocality"],
      source: "REVERSE_GEOCODE", observationCount: 4,
    }, {
      candidateName: "Koteshwore Bus Stand",
      candidateCoordinates: { lat: 27.709, lng: 85.35 },
      formattedAddress: "Ring Road, Kathmandu",
      googleTypes: ["bus_station"],
      source: "SEARCH_ALONG_ROUTE",
    }],
  });

  const canonical = result.candidates.find((candidate) => candidate.providerSnapshot.displayName === "Koteshwar");
  const boarding = result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Koteshwore Bus Stand"
  );
  assert.equal(canonical.classification.entityType, "ROUTE_STOP");
  assert.equal(String(canonical.matchedStopId), "koteshwar");
  assert.equal(boarding.classification.entityType, "BOARDING_LOCATION");
  assert.equal(String(boarding.classification.suggestedParentStopId), "koteshwar");
  assert.equal(boarding.reviewStatus, "EXCLUDE");
});

test("endpoint density changes evidence threshold but never promotes registry proximity alone", async () => {
  const result = await buildRouteStopCandidates({
    originAnchor: { _id: "origin", name: "Origin", coordinates: { lat: 27, lng: 85 } },
    destinationAnchor: { _id: "destination", name: "Destination", coordinates: { lat: 27, lng: 86 } },
    selectedRouteOption: { distanceMeters: 111000, durationSeconds: 12000 },
    polyline: [[85, 27], [86, 27]],
  }, {
    StopModel: stopModel([{
      _id: "origin-zone", name: "Origin Child", coordinates: { lat: 27.002, lng: 85.1 },
    }, {
      _id: "middle-off-road", name: "Middle Detour", coordinates: { lat: 27.04, lng: 85.5 },
    }, {
      _id: "destination-zone", name: "Destination Child", coordinates: { lat: 27.002, lng: 85.9 },
    }]),
    discoverPlaces: async () => [{
      candidateName: "Origin Child", candidateCoordinates: { lat: 27.002, lng: 85.1 },
      source: "REVERSE_GEOCODE", observationCount: 2, googleTypes: ["locality"],
    }, {
      candidateName: "Destination Child", candidateCoordinates: { lat: 27.002, lng: 85.9 },
      source: "REVERSE_GEOCODE", observationCount: 2, googleTypes: ["locality"],
    }],
  });

  assert.ok(result.candidates.some((candidate) => candidate.providerSnapshot.displayName === "Origin Child"));
  assert.ok(result.candidates.some((candidate) => candidate.providerSnapshot.displayName === "Destination Child"));
  assert.equal(result.candidates.some((candidate) =>
    candidate.providerSnapshot.displayName === "Middle Detour"
  ), false);
  assert.equal(result.candidates.find((candidate) =>
    candidate.providerSnapshot.displayName === "Origin Child"
  ).classification.coverageZone, "ORIGIN_40KM");
});

test("temporary candidate writes preserve locked terminal resolution and reject invalid terminal input", () => {
  const writes = buildCandidateWrites([{
    isTerminal: true,
    providerSnapshot: { provider: "PLATFORM_STOP", displayName: "Kalanki" },
    coordinates: { lat: 27, lng: 85 },
    matchedStopId: "origin", resolvedStopId: "origin", reviewStatus: "USE_EXISTING",
  }], { mapReviewId: "review", variantId: "variant", expiresAt: new Date("2026-08-10") });
  assert.equal(writes[0].isTerminal, true);
  assert.equal(writes[0].reviewStatus, "USE_EXISTING");
  assert.equal(writes[0].resolvedStopId, "origin");

  assert.throws(() => buildCandidateWrites([{
    isTerminal: true,
    providerSnapshot: { provider: "PLATFORM_STOP", displayName: "Kalanki" },
    coordinates: { lat: 27, lng: 85 }, reviewStatus: "EXCLUDE",
  }], { mapReviewId: "review", variantId: "variant", expiresAt: new Date("2026-08-10") }),
  (error) => error.code === "INVALID_MAP_ROUTE_REVIEW");
});

test("draft response exposes canonical IDs and temporary route geometry only through the review payload", () => {
  const draft = mapVariantDraft({
    variant: {
      _id: "variant-1", corridorId: "corridor-1", code: "KTM-MLW-V01-F",
      direction: "FORWARD", status: "DRAFT", type: "STANDARD",
      originTerminalStopId: { _id: "kalanki", name: "Kalanki", code: "KAL" },
      destinationTerminalStopId: { _id: "malangwa", name: "Malangwa Bus Park", code: "MLW" },
    },
    review: {
      reviewStatus: "ROUTE_SELECTED", selectedRouteOptionKey: "option-1",
      routeDataVersion: 2, candidateEngineVersion: null,
      routeOptions: [{ optionKey: "option-1", providerRouteIndex: 0, distanceMeters: 12000, durationSeconds: 1800, encodedPolyline: "encoded" }],
    },
  });
  assert.equal(draft._id, "variant-1");
  assert.equal(draft.originTerminal.stopId, "kalanki");
  assert.equal(draft.routeOptions[0].encodedPolyline, "encoded");
  assert.equal(draft.selectedRouteOptionId, "option-1");
  assert.equal(draft.nextAction, "REVIEW_STOPS");
});

test("missing-stop proposals are prefilled from temporary Google place details", () => {
  const draft = mapVariantDraft({
    variant: { _id: "variant", corridorId: "corridor", status: "DRAFT", direction: "FORWARD" },
    review: {
      selectedRouteOptionKey: "route", reviewStatus: "STOP_CANDIDATES_READY",
      routeDataVersion: 2, candidateEngineVersion: 14, routeOptions: [],
    },
    candidates: [{
      _id: "candidate", sequence: 1, reviewStatus: "UNREVIEWED",
      coordinates: { lat: 27.1, lng: 85.2 },
      classification: { entityType: "SERVICE_AREA", confidence: "LOW" },
      providerSnapshot: {
        provider: "GOOGLE_PLACES", placeId: "google-place",
        displayName: "Haripur", formattedAddress: "Haripur, Sarlahi, Nepal",
        administrativeContext: {
          province: "Madhesh Province", district: "Sarlahi", municipality: "Haripur Municipality",
        },
      },
    }],
  });
  assert.deepEqual(draft.candidates[0].suggestedStop, {
    name: "Haripur", type: "TOWN", province: "Madhesh Province", district: "Sarlahi",
    municipality: "Haripur Municipality", coordinates: { lat: 27.1, lng: 85.2 },
    isSearchable: true, isRouteStop: true, coordinateSource: "GOOGLE_PLACE",
    coordinateProvider: "GOOGLE", coordinatePlaceId: "google-place",
    coordinateSuggestedAddress: "Haripur, Sarlahi, Nepal",
  });
});

test("draft next action is explicit and follows review decisions instead of candidate presence", () => {
  const base = {
    variant: { _id: "variant", corridorId: "corridor", status: "DRAFT", direction: "FORWARD" },
    review: {
      selectedRouteOptionKey: "route", reviewStatus: "STOP_CANDIDATES_READY",
      routeDataVersion: 2, candidateEngineVersion: 14, routeOptions: [],
    },
  };
  assert.equal(mapVariantDraft({
    ...base,
    candidates: [{ _id: "one", reviewStatus: "UNREVIEWED", classification: { entityType: "ROUTE_STOP" }, providerSnapshot: { displayName: "Place" } }],
  }).nextAction, "REVIEW_STOPS");
  assert.equal(mapVariantDraft({
    ...base,
    candidates: [{ _id: "one", reviewStatus: "USE_EXISTING", classification: { entityType: "ROUTE_STOP" }, providerSnapshot: { displayName: "Place" } }],
  }).nextAction, "NAME_PATH");
  assert.equal(mapVariantDraft({
    ...base,
    variant: { ...base.variant, name: "Via Hetauda" },
    candidates: [{ _id: "one", reviewStatus: "USE_EXISTING", classification: { entityType: "ROUTE_STOP" }, providerSnapshot: { displayName: "Place" } }],
  }).nextAction, "READY_TO_SAVE");
});

test("boarding-location evidence never blocks the route path naming step", () => {
  const draft = mapVariantDraft({
    variant: { _id: "variant", corridorId: "corridor", status: "DRAFT", direction: "FORWARD" },
    review: {
      selectedRouteOptionKey: "route", reviewStatus: "STOP_CANDIDATES_READY",
      routeDataVersion: 2, candidateEngineVersion: 14, routeOptions: [],
    },
    candidates: [{
      _id: "boarding", reviewStatus: "UNREVIEWED",
      classification: { entityType: "BOARDING_LOCATION" },
      providerSnapshot: { displayName: "Bus park" },
    }],
  });
  assert.equal(draft.nextAction, "NAME_PATH");
  const included = assertCandidatesReady([{
    _id: "origin", reviewStatus: "USE_EXISTING", classification: { entityType: "ROUTE_STOP" },
  }, {
    _id: "boarding", reviewStatus: "UNREVIEWED",
    classification: { entityType: "BOARDING_LOCATION" },
  }, {
    _id: "destination", reviewStatus: "USE_EXISTING", classification: { entityType: "ROUTE_STOP" },
  }], { originTerminalStopId: null, destinationTerminalStopId: null });
  assert.deepEqual(included.map((candidate) => candidate._id), ["origin", "destination"]);
});

test("stale route and candidate-engine payloads are never returned to the admin", () => {
  const draft = mapVariantDraft({
    variant: { _id: "variant", corridorId: "corridor", status: "DRAFT", direction: "FORWARD" },
    review: {
      selectedRouteOptionKey: "old-route", reviewStatus: "STOP_CANDIDATES_READY",
      routeDataVersion: 1, candidateEngineVersion: 1,
      routeOptions: [{ optionKey: "old-route", distanceMeters: 1, durationSeconds: 1 }],
    },
    candidates: [{ _id: "old", reviewStatus: "UNREVIEWED", providerSnapshot: { displayName: "Kathmandu" } }],
  });
  assert.deepEqual(draft.routeOptions, []);
  assert.deepEqual(draft.candidates, []);
  assert.equal(draft.nextAction, "SELECT_PATH");
  assert.match(draft.warnings[0], /older engine/i);
});

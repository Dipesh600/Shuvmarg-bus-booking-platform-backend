"use strict";

const { discoverStopsAlongRoute } = require("../../../../../services/googlePlacesClient.js");
const { buildRouteMetric, locateOnRoute, routeTiming } = require("./route-stop-candidate.geometry.js");
const {
  buildTerminalCandidate, deduplicateCandidates, loadNearbyCanonicalStops,
} = require("./route-stop-candidate.registry.js");
const { reconcileTransitPlaces } = require("./route-stop-candidate.place-matching.js");

const DEFAULT_MATCH_RADIUS_METERS = 500;
const DEFAULT_ROUTE_PROXIMITY_METERS = 500;
const DEFAULT_SERVICE_AREA_MATCH_METERS = 2_000;
const ENDPOINT_DENSE_COVERAGE_METERS = 40_000;

async function loadGooglePlaceSuggestions({ polyline, option, metric, originName, destinationName }, discoverPlaces) {
  const suggestions = await discoverPlaces(
    { type: "LineString", coordinates: polyline }, option.distanceMeters / 1000,
    option.durationSeconds / 60, originName, destinationName, {
      maxSamples: 80, encodedPolyline: option.encodedPolyline,
    }
  );
  return suggestions.map((suggestion) => {
    const coordinates = suggestion.candidateCoordinates;
    return {
      isTerminal: false,
      providerSnapshot: {
        provider: "GOOGLE_PLACES", placeId: suggestion.googlePlaceId || null,
        displayName: suggestion.candidateName,
        formattedAddress: suggestion.formattedAddress || null,
        discoveryMethod: suggestion.source || "REVERSE_GEOCODE",
        types: [...new Set([
          suggestion.googlePrimaryType,
          ...(suggestion.googleTypes || []),
        ].filter(Boolean))],
        administrativeContext: suggestion.administrativeContext || null,
        evidenceCount: Number.isFinite(suggestion.observationCount)
          ? suggestion.observationCount : 1,
        observedSpanKm: Number.isFinite(suggestion.observedSpanKm)
          ? suggestion.observedSpanKm : 0,
      },
      coordinates,
      ...routeTiming(locateOnRoute(coordinates, metric), option, metric),
      matchedStopId: null, resolvedStopId: null, reviewStatus: "UNREVIEWED",
    };
  });
}

function isEligibleRouteStopAnchor(stop) {
  return stop?.isRouteStop === true &&
    stop.status === "ACTIVE" &&
    stop.verificationStatus === "VERIFIED";
}

async function buildRouteStopCandidates({
  originTerminal, destinationTerminal, originAnchor, destinationAnchor,
  selectedRouteOption, polyline,
}, dependencies = {}) {
  const metric = buildRouteMetric(polyline);
  const origin = originTerminal || originAnchor;
  const destination = destinationTerminal || destinationAnchor;
  const proximityMeters = dependencies.proximityMeters || DEFAULT_ROUTE_PROXIMITY_METERS;
  const serviceAreaMatchMeters = dependencies.serviceAreaMatchMeters || DEFAULT_SERVICE_AREA_MATCH_METERS;
  const canonicalStops = await loadNearbyCanonicalStops(metric, serviceAreaMatchMeters, dependencies.StopModel);
  const suggestions = await loadGooglePlaceSuggestions({
    polyline, option: selectedRouteOption, metric, originName: origin?.name,
    destinationName: destination?.name,
  }, dependencies.discoverPlaces || discoverStopsAlongRoute).catch((error) => ({ error }));
  const placeSuggestions = Array.isArray(suggestions) ? suggestions.filter((candidate) =>
    locateOnRoute(candidate.coordinates, metric).distanceToRouteMeters <= proximityMeters
  ) : [];
  const reconciled = reconcileTransitPlaces(placeSuggestions, canonicalStops, serviceAreaMatchMeters);
  const resolvedOriginTerminal = originTerminal || (isEligibleRouteStopAnchor(originAnchor) ? originAnchor : null);
  const resolvedDestinationTerminal = destinationTerminal ||
    (isEligibleRouteStopAnchor(destinationAnchor) ? destinationAnchor : null);
  const terminalIds = [resolvedOriginTerminal?._id, resolvedDestinationTerminal?._id].filter(Boolean);
  const routeServiceAreas = reconciled.serviceAreaSuggestions.filter((candidate) => {
    const remainingMeters = Math.max(0, metric.lengthMeters - candidate.distanceFromOriginMeters);
    const inOrigin = candidate.distanceFromOriginMeters <= ENDPOINT_DENSE_COVERAGE_METERS;
    const inDestination = remainingMeters <= ENDPOINT_DENSE_COVERAGE_METERS;
    candidate.classification.coverageZone = inOrigin ? "ORIGIN_40KM" :
      inDestination ? "DESTINATION_40KM" : "MIDDLE";
    const routeLocation = locateOnRoute(candidate.coordinates, metric);
    candidate.classification.distanceToRouteMeters = Math.round(routeLocation.distanceToRouteMeters);
    const observationScore = candidate.providerSnapshot.evidenceCount >= 4 ? 35 :
      candidate.providerSnapshot.evidenceCount >= 2 ? 25 : 10;
    const localityTypeScore = candidate.providerSnapshot.types.some((type) =>
      ["neighborhood", "sublocality", "sublocality_level_1", "sublocality_level_2",
        "sublocality_level_3", "sublocality_level_4", "locality"].includes(type)
    ) ? 10 : 5;
    const routeScore = routeLocation.distanceToRouteMeters <= 100 ? 10 :
      routeLocation.distanceToRouteMeters <= 300 ? 5 : 0;
    const endpointScore = inOrigin || inDestination ? 10 : 0;
    const transitScore = candidate.classification.reasonCodes.some((reason) =>
      reason === "TRANSIT_EVIDENCE_CORROBORATED" ||
      reason === "TRANSIT_PLACE_SERVICE_AREA_INFERENCE"
    ) ? 30 : 0;
    // Registry identity is useful for reuse, but never proves that this route
    // serves the Stop. It only strengthens independently observed road evidence.
    const registryMatchScore = candidate.matchedStopId ? 10 : 0;
    const evidenceScore = observationScore + localityTypeScore + routeScore + endpointScore +
      transitScore + registryMatchScore;
    candidate.classification.evidenceScore = evidenceScore;
    candidate.classification.confidence = evidenceScore >= 70 ? "HIGH" :
      evidenceScore >= 50 ? "MEDIUM" : "LOW";
    // Endpoint coverage is intentionally review-first. A single precise
    // neighbourhood/locality observation on the selected road is useful
    // evidence in the first/last 40 km even when Shuvmarg has no matching
    // Stop yet. Requiring a registry match here made the scanner preserve
    // known places while silently dropping the exact missing places the
    // review workflow is meant to discover.
    const threshold = inOrigin || inDestination ? 40 : 55;
    return routeLocation.distanceToRouteMeters <= proximityMeters && evidenceScore >= threshold;
  });
  const interior = deduplicateCandidates([
    ...routeServiceAreas,
    ...reconciled.annotatedPlaces,
  ], dependencies.matchRadiusMeters || DEFAULT_MATCH_RADIUS_METERS, {
    ids: [origin?._id, destination?._id],
    names: [origin?.name, destination?.name],
    terminalCoordinates: [resolvedOriginTerminal?.coordinates, resolvedDestinationTerminal?.coordinates],
  });
  const candidates = [
    ...(resolvedOriginTerminal ? [buildTerminalCandidate(resolvedOriginTerminal, false, selectedRouteOption, metric)] : []),
    ...interior,
    ...(resolvedDestinationTerminal ? [buildTerminalCandidate(resolvedDestinationTerminal, true, selectedRouteOption, metric)] : []),
  ];
  const reviewableInterior = interior.filter((candidate) =>
    candidate.classification?.entityType === "ROUTE_STOP" ||
    candidate.classification?.entityType === "SERVICE_AREA"
  );
  const coverageWarning = metric.lengthMeters >= 80_000 && reviewableInterior.length < 4
    ? `Route-stop discovery found only ${reviewableInterior.length} reviewable places across ` +
      `${Math.round(metric.lengthMeters / 1000)} km. Treat this as incomplete coverage and retry or review the path manually.`
    : null;
  return {
    candidates: candidates.map((candidate, index) => ({ ...candidate, sequence: index + 1 })),
    warnings: [suggestions?.error?.message, coverageWarning].filter(Boolean),
  };
}

module.exports = {
  DEFAULT_MATCH_RADIUS_METERS, DEFAULT_ROUTE_PROXIMITY_METERS, DEFAULT_SERVICE_AREA_MATCH_METERS,
  ENDPOINT_DENSE_COVERAGE_METERS,
  buildRouteMetric, buildRouteStopCandidates,
};

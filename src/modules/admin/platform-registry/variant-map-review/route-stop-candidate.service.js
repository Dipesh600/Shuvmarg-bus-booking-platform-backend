"use strict";

const { discoverStopsAlongRoute } = require("../../../../../services/googlePlacesClient.js");
const { buildRouteMetric, locateOnRoute, routeTiming } = require("./route-stop-candidate.geometry.js");
const {
  buildRegistryCandidates, buildTerminalCandidate, deduplicateCandidates,
  loadEndpointChildren, loadNearbyCanonicalStops,
} = require("./route-stop-candidate.registry.js");
const { reconcileTransitPlaces } = require("./route-stop-candidate.place-matching.js");

const DEFAULT_MATCH_RADIUS_METERS = 500;
const DEFAULT_ROUTE_PROXIMITY_METERS = 500;
const DEFAULT_SERVICE_AREA_MATCH_METERS = 8_000;
const ENDPOINT_DENSE_COVERAGE_METERS = 40_000;

async function loadGooglePlaceSuggestions({ polyline, option, metric, originName, destinationName }, discoverPlaces) {
  const suggestions = await discoverPlaces(
    { type: "LineString", coordinates: polyline }, option.distanceMeters / 1000,
    option.durationSeconds / 60, originName, destinationName, {
      maxSamples: 48, encodedPolyline: option.encodedPolyline,
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
  const endpointChildren = await loadEndpointChildren(
    metric, [origin?._id, destination?._id], dependencies.StopModel
  );
  const nearbyStops = canonicalStops.filter(({ location }) => {
    const remainingMeters = Math.max(0, metric.lengthMeters - location.distanceFromOriginMeters);
    const endpointZone = location.distanceFromOriginMeters <= ENDPOINT_DENSE_COVERAGE_METERS ||
      remainingMeters <= ENDPOINT_DENSE_COVERAGE_METERS;
    return location.distanceToRouteMeters <= (endpointZone ? serviceAreaMatchMeters : proximityMeters);
  });
  const suggestions = await loadGooglePlaceSuggestions({
    polyline, option: selectedRouteOption, metric, originName: origin?.name,
    destinationName: destination?.name,
  }, dependencies.discoverPlaces || discoverStopsAlongRoute).catch((error) => ({ error }));
  const placeSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const reconciled = reconcileTransitPlaces(placeSuggestions, canonicalStops, serviceAreaMatchMeters);
  const resolvedOriginTerminal = originTerminal || (isEligibleRouteStopAnchor(originAnchor) ? originAnchor : null);
  const resolvedDestinationTerminal = destinationTerminal ||
    (isEligibleRouteStopAnchor(destinationAnchor) ? destinationAnchor : null);
  const terminalIds = [resolvedOriginTerminal?._id, resolvedDestinationTerminal?._id].filter(Boolean);
  const endpointScopedChildren = endpointChildren.filter(({ location }) =>
    location.distanceFromOriginMeters <= ENDPOINT_DENSE_COVERAGE_METERS ||
    metric.lengthMeters - location.distanceFromOriginMeters <= ENDPOINT_DENSE_COVERAGE_METERS
  );
  const registryEvidence = [...new Map([
    ...nearbyStops, ...endpointScopedChildren, ...reconciled.matchedEntries,
  ]
    .map((entry) => [String(entry.stop._id), entry])).values()];
  const endpointServiceAreas = reconciled.serviceAreaSuggestions.filter((candidate) => {
    const remainingMeters = Math.max(0, metric.lengthMeters - candidate.distanceFromOriginMeters);
    const inOrigin = candidate.distanceFromOriginMeters <= ENDPOINT_DENSE_COVERAGE_METERS;
    const inDestination = remainingMeters <= ENDPOINT_DENSE_COVERAGE_METERS;
    if (!inOrigin && !inDestination) return false;
    candidate.classification.coverageZone = inOrigin ? "ORIGIN_40KM" : "DESTINATION_40KM";
    candidate.classification.distanceToRouteMeters = Math.round(
      locateOnRoute(candidate.coordinates, metric).distanceToRouteMeters
    );
    return true;
  });
  const interior = deduplicateCandidates([
    ...buildRegistryCandidates(registryEvidence, selectedRouteOption, metric, terminalIds),
    ...endpointServiceAreas,
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
  return {
    candidates: candidates.map((candidate, index) => ({ ...candidate, sequence: index + 1 })),
    warnings: suggestions?.error ? [suggestions.error.message] : [],
  };
}

module.exports = {
  DEFAULT_MATCH_RADIUS_METERS, DEFAULT_ROUTE_PROXIMITY_METERS, DEFAULT_SERVICE_AREA_MATCH_METERS,
  ENDPOINT_DENSE_COVERAGE_METERS,
  buildRouteMetric, buildRouteStopCandidates,
};

"use strict";

const Stop = require("../../../../../models/stopModel.js");
const {
  locateOnRoute, metersBetween, routeBoundingBox, routeTiming, stopAddress, toCoordinates,
} = require("./route-stop-candidate.geometry.js");

const STOP_FIELDS = "_id code name aliases province district municipality coordinates parentStopId";

async function loadNearbyCanonicalStops(metric, proximityMeters, StopModel = Stop) {
  const bounds = routeBoundingBox(metric.points, proximityMeters);
  const stops = await StopModel.find({
    status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
    "coordinates.lat": { $gte: bounds.minLat, $lte: bounds.maxLat },
    "coordinates.lng": { $gte: bounds.minLng, $lte: bounds.maxLng },
  }).select(STOP_FIELDS).lean();
  return stops.map((stop) => ({ stop, location: locateOnRoute(toCoordinates(stop), metric) }))
    .filter(({ location }) => location.distanceToRouteMeters <= proximityMeters)
    .sort((left, right) => left.location.distanceFromOriginMeters - right.location.distanceFromOriginMeters);
}

async function loadEndpointChildren(metric, endpointIds, StopModel = Stop) {
  const ids = endpointIds.filter(Boolean);
  if (!ids.length) return [];
  const stops = await StopModel.find({
    parentStopId: { $in: ids }, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
  }).select(STOP_FIELDS).lean();
  return stops.map((stop) => ({ stop, location: locateOnRoute(toCoordinates(stop), metric) }));
}

function isSameStop(left, right) { return String(left) === String(right); }

function normalizePlaceName(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function buildTerminalCandidate(stop, isDestination, option, metric) {
  const location = { distanceFromOriginMeters: isDestination ? metric.lengthMeters : 0 };
  return {
    isTerminal: true,
    providerSnapshot: { provider: "PLATFORM_STOP", displayName: stop.name, formattedAddress: stopAddress(stop) },
    classification: {
      entityType: "ROUTE_STOP", confidence: "HIGH",
      reasonCodes: ["CANONICAL_VERIFIED_ROUTE_STOP"], suggestedParentStopId: null,
    },
    coordinates: toCoordinates(stop),
    ...routeTiming(location, option, metric),
    matchedStopId: stop._id, resolvedStopId: stop._id, reviewStatus: "USE_EXISTING",
  };
}

function buildRegistryCandidates(stops, option, metric, terminalIds) {
  return stops.filter(({ stop }) => !terminalIds.some((id) => isSameStop(stop._id, id)))
    .map(({ stop, location }) => {
      const remainingMeters = Math.max(0, metric.lengthMeters - location.distanceFromOriginMeters);
      const coverageZone = location.distanceFromOriginMeters <= 40_000 ? "ORIGIN_40KM" :
        remainingMeters <= 40_000 ? "DESTINATION_40KM" : "MIDDLE";
      return ({
      isTerminal: false,
      providerSnapshot: { provider: "PLATFORM_STOP", displayName: stop.name, formattedAddress: stopAddress(stop) },
      classification: {
        entityType: "ROUTE_STOP", confidence: "HIGH",
        reasonCodes: ["CANONICAL_VERIFIED_ROUTE_STOP"], suggestedParentStopId: null,
        coverageZone, distanceToRouteMeters: Math.round(location.distanceToRouteMeters),
      },
      coordinates: toCoordinates(stop),
      ...routeTiming(location, option, metric),
      matchedStopId: stop._id, resolvedStopId: null, reviewStatus: "UNREVIEWED",
      });
    });
}

function nearestRegistryMatch(candidate, registry, radiusMeters) {
  const candidateName = normalizePlaceName(candidate.providerSnapshot?.displayName);
  return registry.reduce((closest, entry) => {
    if (normalizePlaceName(entry.providerSnapshot?.displayName) !== candidateName) return closest;
    const distanceMeters = metersBetween(candidate.coordinates, entry.coordinates);
    return distanceMeters <= radiusMeters && (!closest || distanceMeters < closest.distanceMeters)
      ? { entry, distanceMeters } : closest;
  }, null);
}

function nearestRegistryByDistance(candidate, registry, radiusMeters) {
  return registry.reduce((closest, entry) => {
    const distanceMeters = metersBetween(candidate.coordinates, entry.coordinates);
    return distanceMeters <= radiusMeters && (!closest || distanceMeters < closest.distanceMeters)
      ? { entry, distanceMeters } : closest;
  }, null);
}

function classifyGooglePlace(candidate, registry, radiusMeters = 2_000) {
  const explicitParent = candidate.classification?.suggestedParentStopId || null;
  const nearby = nearestRegistryByDistance(candidate, registry, radiusMeters);
  return {
    ...candidate,
    classification: {
      entityType: "BOARDING_LOCATION",
      confidence: candidate.classification?.confidence || (nearby ? "HIGH" : "MEDIUM"),
      reasonCodes: [
        "GOOGLE_TRANSIT_PLACE",
        explicitParent || nearby ? "NEAR_CANONICAL_ROUTE_STOP" : "NO_CANONICAL_ROUTE_STOP_NEARBY",
      ],
      suggestedParentStopId: explicitParent || nearby?.entry.matchedStopId || nearby?.entry.resolvedStopId || null,
    },
    // A Google transit POI is never promoted into the variant sequence by the
    // machine. When it has a canonical parent it is informational boarding
    // evidence and is excluded automatically.
    reviewStatus: "EXCLUDE",
  };
}

function deduplicateCandidates(candidates, registryMatchRadiusMeters, endpointContext = {}) {
  const endpointIds = new Set((endpointContext.ids || []).filter(Boolean).map(String));
  const endpointNames = new Set((endpointContext.names || []).map(normalizePlaceName).filter(Boolean));
  const terminalCoordinates = (endpointContext.terminalCoordinates || []).filter(Boolean);
  const outsideEndpointScope = candidates.filter((candidate) => {
    const stopId = candidate.matchedStopId || candidate.resolvedStopId;
    if (stopId && endpointIds.has(String(stopId))) return false;
    if (terminalCoordinates.some((coordinates) =>
      metersBetween(candidate.coordinates, coordinates) < 2_000
    )) return false;
    return !endpointNames.has(normalizePlaceName(candidate.providerSnapshot?.displayName));
  });
  const registry = outsideEndpointScope.filter((candidate) => candidate.providerSnapshot.provider === "PLATFORM_STOP");
  const retained = outsideEndpointScope.filter((candidate, index, all) => !all.slice(0, index).some((existing) =>
    normalizePlaceName(existing.providerSnapshot.displayName) === normalizePlaceName(candidate.providerSnapshot.displayName) &&
    metersBetween(existing.coordinates, candidate.coordinates) < 10_000
  )).filter((candidate) => candidate.providerSnapshot.provider !== "GOOGLE_PLACES" ||
    !nearestRegistryMatch(candidate, registry, 2_000));

  return retained.map((candidate) => {
    if (candidate.providerSnapshot.provider !== "GOOGLE_PLACES") return candidate;
    if (candidate.classification?.entityType === "SERVICE_AREA") return candidate;
    const match = nearestRegistryMatch(candidate, registry, registryMatchRadiusMeters);
    const classified = classifyGooglePlace(candidate, registry);
    return match ? { ...classified, matchedStopId: match.entry.matchedStopId || match.entry.resolvedStopId } : classified;
  }).sort((left, right) => left.distanceFromOriginMeters - right.distanceFromOriginMeters);
}

module.exports = {
  buildRegistryCandidates, buildTerminalCandidate, deduplicateCandidates,
  classifyGooglePlace, loadEndpointChildren, loadNearbyCanonicalStops, normalizePlaceName,
};

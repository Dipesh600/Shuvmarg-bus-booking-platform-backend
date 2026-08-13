"use strict";

const Stop = require("../../../../../models/stopModel.js");
const {
  locateOnRoute, routeBoundingBox, routeTiming, stopAddress, toCoordinates,
} = require("./route-stop-candidate.geometry.js");
const {
  classifyGooglePlace, deduplicateCandidates, normalizePlaceName,
} = require("./route-stop-candidate.deduplication.js");

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
      providerSnapshot: {
        provider: "PLATFORM_STOP", displayName: stop.name, formattedAddress: stopAddress(stop),
        administrativeContext: {
          province: stop.province || null, district: stop.district || null,
          municipality: stop.municipality || null,
        },
      },
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

module.exports = {
  buildRegistryCandidates, buildTerminalCandidate, deduplicateCandidates,
  classifyGooglePlace, loadEndpointChildren, loadNearbyCanonicalStops, normalizePlaceName,
};

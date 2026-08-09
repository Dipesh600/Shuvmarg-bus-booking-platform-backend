"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const {
  discoverStopsAlongRoute,
} = require("../../../../services/googlePlacesClient.js");
const { setDiscoveredStops } = require("./discovered-stop.service.js");

function endpointCandidate(stop, sequenceOrder, distanceFromOriginKm, durationFromOriginMins) {
  return {
    candidateName: stop.name,
    candidateCoordinates: stop.coordinates,
    routeStopId: stop._id,
    sequenceOrder,
    distanceFromOriginKm,
    durationFromOriginMins,
    adminAction: "APPROVED",
    source: "CORRIDOR_ENDPOINT",
  };
}

function withLockedEndpoints(candidates, origin, destination, distanceKm, durationMins) {
  const endpointNames = new Set([origin.name.toLowerCase(), destination.name.toLowerCase()]);
  const interior = candidates.filter((candidate) =>
    !endpointNames.has((candidate.candidateName || "").toLowerCase())
  );
  const all = [
    endpointCandidate(origin, 0, 0, 0),
    ...interior,
    endpointCandidate(destination, 0, distanceKm, durationMins),
  ];
  return all.map((candidate, index) => ({ ...candidate, sequenceOrder: index }));
}

const acquireStopsForSelectedRoute = async (session, routeOptionIndex) => {
  try {
    const selectedRoute = session.routeOptions[routeOptionIndex];
    const origin = session.originStopId;
    const destination = session.destinationStopId;
    const geometry = selectedRoute?.geometry;
    if (!geometry) {
      console.warn(
        `[Discovery] Session ${session._id}: no geometry and stops have no coordinates. Cannot auto-discover stops.`
      );
      return;
    }
    const discoveredStops = await discoverStopsAlongRoute(
      geometry,
      selectedRoute.distanceKm,
      selectedRoute.durationMins,
      origin?.name || "",
      destination?.name || ""
    );
    await setDiscoveredStops(
      session._id,
      withLockedEndpoints(
        discoveredStops,
        origin,
        destination,
        selectedRoute.distanceKm,
        selectedRoute.durationMins
      )
    );
    if (discoveredStops.length === 0) {
      console.warn(
        `[Discovery] Session ${session._id}: Google Places found no bus stops along route.`
      );
    } else {
      console.log(
        `[Discovery] Session ${session._id}: ${discoveredStops.length} stop(s) discovered via Google Places.`
      );
    }
  } catch (error) {
    console.error(
      `[Discovery] Session ${session._id}: Google Places fetch failed — ${error.message}`
    );
  }
};

module.exports = { acquireStopsForSelectedRoute };

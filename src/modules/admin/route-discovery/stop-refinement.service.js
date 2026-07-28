"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const minimaxClient = require("../../../../services/minimaxClient.js");
const { getDiscoverySession } = require("./route-discovery-query.service.js");

const refineStopsWithLLM = async (sessionId, adminId, onChunk) => {
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  if (!["STOPS_DISCOVERED", "APPROVED"].includes(session.status)) {
    throw new Error(
      "Stops can only be refined when in STOPS_DISCOVERED or APPROVED status."
    );
  }
  if (session.discoveredStops.length === 0) throw new Error("No stops to refine.");
  let polyline = "N/A";
  const selected = session.routeOptions[session.selectedRouteOptionIndex];
  if (session.selectedRouteOptionIndex !== null && selected) {
    polyline = selected.polyline || "N/A";
  }
  const rawStops = session.discoveredStops.map((stop) => ({
    candidateName: stop.candidateName,
    candidateCoordinates: stop.candidateCoordinates,
    distanceFromOriginKm: stop.distanceFromOriginKm,
    durationFromOriginMins: stop.durationFromOriginMins,
    sequenceOrder: stop.sequenceOrder,
  }));
  const refined = await minimaxClient.refineStopsWithMinimax(
    rawStops,
    polyline,
    onChunk
  );
  session.discoveredStops = refined.map((stop, index) => ({
    candidateName: stop.candidateName,
    candidateCoordinates: stop.candidateCoordinates,
    distanceFromOriginKm: stop.distanceFromOriginKm,
    durationFromOriginMins: stop.durationFromOriginMins,
    sequenceOrder:
      stop.sequenceOrder !== undefined ? stop.sequenceOrder : index,
    adminAction: "PENDING",
  }));
  session.isLlmRefined = true;
  await session.save();
  return getDiscoverySession(sessionId);
};

module.exports = { refineStopsWithLLM };

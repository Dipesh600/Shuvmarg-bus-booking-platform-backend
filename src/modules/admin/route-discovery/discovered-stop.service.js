"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const { matchCandidateStop } = require("./stop-registry.service.js");

const resolveCandidate = async (stop, index) => {
  const candidateName = (stop.candidateName || "").trim();
  const coordinates = stop.candidateCoordinates || null;
  let routeStopId = stop.routeStopId || null;
  let adminAction = stop.adminAction || "PENDING";
  let match = null;
  if (candidateName && !routeStopId) {
    try {
      match = await matchCandidateStop(candidateName, coordinates);
    } catch (error) {
      console.warn(
        `[Discovery] Match failed for "${candidateName}": ${error.message}`
      );
    }
  }
  if (match) {
    routeStopId = match.stopId;
  }
  return {
    ...stop,
    sequenceOrder:
      stop.sequenceOrder !== undefined ? stop.sequenceOrder : index,
    routeStopId,
    adminAction,
    _matchType: match?.matchType || null,
    _matchedName: match?.matchedName || null,
  };
};

const setDiscoveredStops = async (sessionId, discoveredStops) => {
  if (!Array.isArray(discoveredStops) || discoveredStops.length === 0) {
    throw new Error("discoveredStops must be a non-empty array.");
  }
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  if (session.status !== "ROUTE_SELECTED") {
    throw new Error(
      "Can only set discovered stops when status is ROUTE_SELECTED. " +
      `Current status: ${session.status}.`
    );
  }
  const resolvedStops = [];
  for (let index = 0; index < discoveredStops.length; index += 1) {
    resolvedStops.push(await resolveCandidate(discoveredStops[index], index));
  }
  session.discoveredStops = resolvedStops;
  session.status = "STOPS_DISCOVERED";
  await session.save();
  return session;
};

module.exports = { setDiscoveredStops };

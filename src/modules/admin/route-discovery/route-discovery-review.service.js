"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const Stop = require("../../../../models/stopModel.js");
const { assertTransition } = require("./route-discovery-state.policy.js");

const patchDiscoveredStop = async (sessionId, stopSubDocId, patch) => {
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  if (!["STOPS_DISCOVERED", "APPROVED"].includes(session.status)) {
    throw new Error(
      `Cannot edit stops in status "${session.status}". ` +
      "Session must be in STOPS_DISCOVERED or APPROVED status."
    );
  }
  const stopEntry = session.discoveredStops.id(stopSubDocId);
  if (!stopEntry) {
    throw new Error(`Discovered stop sub-document not found: ${stopSubDocId}`);
  }
  const {
    adminAction,
    candidateName,
    candidateCoordinates,
    routeStopId,
    mergedIntoRouteStopId,
  } = patch;
  if (adminAction) {
    const valid = ["PENDING", "APPROVED", "REJECTED", "EDITED", "MERGED"];
    if (!valid.includes(adminAction)) {
      throw new Error(
        `Invalid adminAction: "${adminAction}". Must be one of: ${valid.join(", ")}`
      );
    }
    if (adminAction === "MERGED" && !mergedIntoRouteStopId) {
      throw new Error("mergedIntoRouteStopId is required when adminAction is MERGED.");
    }
    if (adminAction === "MERGED") {
      const target = await Stop.findById(mergedIntoRouteStopId)
        .select("_id name")
        .lean();
      if (!target) {
        throw new Error(`Merge target stop not found: ${mergedIntoRouteStopId}`);
      }
      stopEntry.mergedIntoRouteStopId = mergedIntoRouteStopId;
    }
    stopEntry.adminAction = adminAction;
  }
  if (candidateName !== undefined) stopEntry.candidateName = candidateName;
  if (candidateCoordinates !== undefined) {
    stopEntry.candidateCoordinates = candidateCoordinates;
  }
  if (routeStopId !== undefined) stopEntry.routeStopId = routeStopId || null;
  await session.save();
  return session;
};

const approveSession = async (sessionId, adminId) => {
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  assertTransition(session.status, "APPROVED");
  const approved = session.discoveredStops.filter(
    (stop) => stop.adminAction === "APPROVED" || stop.adminAction === "EDITED"
  );
  if (approved.length < 2) {
    throw new Error(
      "Cannot approve: at least 2 stops must be approved (origin and destination). " +
      `Currently approved: ${approved.length}.`
    );
  }
  session.status = "APPROVED";
  session.approvedBy = adminId;
  await session.save();
  return session;
};

const rejectSession = async (sessionId) => {
  const session = await RouteDiscovery.findById(sessionId);
  if (!session) throw new Error("Discovery session not found.");
  if (session.status === "PUBLISHED") {
    throw new Error("A PUBLISHED session cannot be rejected.");
  }
  session.status = "REJECTED";
  await session.save();
  return session;
};

module.exports = { patchDiscoveredStop, approveSession, rejectSession };

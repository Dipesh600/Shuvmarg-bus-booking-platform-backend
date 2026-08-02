"use strict";

const RouteDiscovery = require("../../../../models/routeDiscoveryModel.js");
const { assertTransition } = require("./route-discovery-state.policy.js");
const { resolvePublishedStop } = require("./published-stop.service.js");
const {
  findOrCreateCorridor,
  createVariant,
  createRouteStops,
} = require("./route-publication-records.service.js");
const {
  activateCorridorIfReady,
} = require("../platform-registry/corridor-registry.service.js");

const resolveStops = async (activeStops, adminId) => {
  const resolved = [];
  for (const entry of activeStops) {
    resolved.push({
      stopId: await resolvePublishedStop(entry, adminId),
      sequenceOrder: entry.sequenceOrder,
      distanceFromOriginKm: entry.distanceFromOriginKm || null,
      durationFromOriginMins: entry.durationFromOriginMins || null,
    });
  }
  return resolved;
};

const publishSession = async (sessionId, publishData = {}, adminId) => {
  const session = await RouteDiscovery.findById(sessionId)
    .populate("originStopId", "name code")
    .populate("destinationStopId", "name code");
  if (!session) throw new Error("Discovery session not found.");
  assertTransition(session.status, "PUBLISHED");
  const activeStops = session.discoveredStops
    .filter((stop) =>
      ["APPROVED", "EDITED", "MERGED"].includes(stop.adminAction)
    )
    .sort((left, right) => left.sequenceOrder - right.sequenceOrder);
  if (activeStops.length < 2) {
    throw new Error("Cannot publish: at least 2 approved stops required.");
  }
  const resolvedStops = await resolveStops(activeStops, adminId);
  const origin = session.originStopId;
  const destination = session.destinationStopId;
  const corridor = await findOrCreateCorridor(
    session,
    origin,
    destination,
    adminId
  );
  const selectedRoute = session.routeOptions[session.selectedRouteOptionIndex];
  const variant = await createVariant(
    corridor,
    selectedRoute,
    origin,
    destination,
    publishData,
    adminId
  );
  await createRouteStops(variant, resolvedStops);
  await activateCorridorIfReady(corridor._id, adminId);
  session.publishedVariant = {
    variantId: variant._id,
    routeStopSequence: resolvedStops.map((entry) => ({
      routeStopId: entry.stopId,
      sequenceOrder: entry.sequenceOrder,
      distanceFromOriginKm: entry.distanceFromOriginKm,
      durationFromOriginMins: entry.durationFromOriginMins,
    })),
    stopPointIds: [],
  };
  session.status = "PUBLISHED";
  session.approvedBy = adminId;
  await session.save();
  return {
    session,
    corridor,
    variant,
    stopsCreated: resolvedStops.length,
  };
};

module.exports = { publishSession };

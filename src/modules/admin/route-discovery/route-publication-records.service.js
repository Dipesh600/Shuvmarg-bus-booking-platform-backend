"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const {
  findOrCreateCorridor: findOrCreateRegistryCorridor,
} = require("../platform-registry/corridor-registry.service.js");

const findOrCreateCorridor = async (session, origin, destination, adminId) => {
  return findOrCreateRegistryCorridor({
    originStopId: origin._id,
    destinationStopId: destination._id,
    source: "DISCOVERY",
    sourceReferenceId: String(session._id),
    notes: `Created from approved discovery session ${session._id}`,
  }, adminId);
};

const createVariant = async (
  corridor,
  selectedRoute,
  origin,
  destination,
  publishData,
  adminId,
  direction = "FORWARD"
) => {
  const count = await RouteVariant.countDocuments({ corridorId: corridor._id });
  const code = `${corridor.code}-V${String(count + 1).padStart(2, "0")}`;
  return RouteVariant.create({
    code,
    corridorId: corridor._id,
    name:
      publishData.variantName ||
      selectedRoute?.summary ||
      `${origin.name} → ${destination.name} (Discovery)`,
    distanceKm: selectedRoute?.distanceKm || null,
    durationMinutes: selectedRoute?.durationMins || null,
    direction,
    status: "DRAFT",
    createdBy: adminId,
  });
};

const assertUniqueStops = (resolvedStops) => {
  const seen = new Set();
  for (const entry of resolvedStops) {
    const key = entry.stopId?.toString();
    if (!key || seen.has(key)) throw new Error("A route stop may appear only once in a variant sequence.");
    seen.add(key);
  }
};

const createRouteStops = async (variant, resolvedStops) => {
  assertUniqueStops(resolvedStops);
  const documents = resolvedStops.map((entry) => ({
    variantId: variant._id,
    stopId: entry.stopId,
    sequence: entry.sequenceOrder + 1,
    isMajor: true,
    distanceFromOriginKm: entry.distanceFromOriginKm,
    durationFromOriginMins: entry.durationFromOriginMins,
    estimatedMinutesFromOrigin: entry.durationFromOriginMins || 0,
  }));
  try {
    await RouteStop.insertMany(documents, { ordered: true });
  } catch (error) {
    await RouteVariant.findByIdAndDelete(variant._id);
    throw new Error(`Failed to publish route stops: ${error.message}`);
  }
};

module.exports = {
  findOrCreateCorridor,
  createVariant,
  createRouteStops,
};

"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorRouteConfig = require(
  "../../../../models/operatorRouteConfigModel.js"
);
const Schedule = require("../../../../models/scheduleModel.js");
const Trip = require("../../../../models/tripModel.js");
const Agent = require("../../../../models/agentModel.js");
const LegacyRouteDiscovery = require("../../../../models/legacyRouteDiscoveryModel.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function getVariantReferenceCounts(variantId, { allowedLinkedVariantId = null } = {}) {
  const [
    routeStopCount,
    operatorRouteConfigCount,
    scheduleCount,
    tripCount,
    agentRouteAccessCount,
    linkedVariantCount,
    discoveryPublicationCount,
  ] = await Promise.all([
    RouteStop.countDocuments({ variantId }),
    OperatorRouteConfig.countDocuments({ variantId }),
    Schedule.countDocuments({ variantId }),
    Trip.countDocuments({ variantId }),
    Agent.countDocuments({ allowedRouteIds: variantId }),
    RouteVariant.countDocuments({
      returnVariantId: variantId,
      ...(allowedLinkedVariantId && { _id: { $ne: allowedLinkedVariantId } }),
    }),
    LegacyRouteDiscovery.countDocuments({ "publishedVariant.variantId": variantId }),
  ]);

  return {
    routeStopCount,
    operatorRouteConfigCount,
    scheduleCount,
    tripCount,
    agentRouteAccessCount,
    linkedVariantCount,
    discoveryPublicationCount,
  };
}

async function getVariantOperationalReferenceCounts(variantId, { now = new Date() } = {}) {
  const [
    activeOperatorRouteConfigCount,
    liveScheduleCount,
    futureTripCount,
    activeAgentRouteAccessCount,
  ] = await Promise.all([
    OperatorRouteConfig.countDocuments({
      variantId,
      status: { $in: ["ACTIVE", "PENDING_REVIEW"] },
    }),
    Schedule.countDocuments({
      variantId,
      status: { $in: ["ACTIVE", "SUSPENDED"] },
    }),
    Trip.countDocuments({
      variantId,
      status: { $in: ["scheduled", "boarding", "in-transit"] },
      tripDate: { $gte: now },
    }),
    Agent.countDocuments({
      allowedRouteIds: variantId,
      applicationStatus: { $in: ["APPROVED", "ACTIVE"] },
    }),
  ]);

  return {
    activeOperatorRouteConfigCount,
    liveScheduleCount,
    futureTripCount,
    activeAgentRouteAccessCount,
  };
}

function hasExternalReferences(counts) {
  return [
    counts.operatorRouteConfigCount,
    counts.scheduleCount,
    counts.tripCount,
    counts.agentRouteAccessCount,
    counts.linkedVariantCount,
    counts.discoveryPublicationCount,
  ].some((count) => count > 0);
}

function hasOperationalReferences(counts) {
  return [
    counts.activeOperatorRouteConfigCount,
    counts.liveScheduleCount,
    counts.futureTripCount,
    counts.activeAgentRouteAccessCount,
  ].some((count) => count > 0);
}

async function assertVariantCanDelete(variant, options = {}) {
  if (variant.status !== "DRAFT") {
    throw routeVariantError(
      "VARIANT_DELETE_REQUIRES_DRAFT",
      "Only an unused draft variant can be permanently deleted. Archive an operational variant instead.",
      409
    );
  }
  const details = await getVariantReferenceCounts(variant._id, options);
  if (hasExternalReferences(details)) {
    throw routeVariantError(
      "VARIANT_IN_USE",
      "This variant is referenced and cannot be permanently deleted.",
      409,
      details
    );
  }
  return details;
}

module.exports = {
  assertVariantCanDelete,
  getVariantReferenceCounts,
  getVariantOperationalReferenceCounts,
  hasExternalReferences,
  hasOperationalReferences,
  variantError: routeVariantError,
};

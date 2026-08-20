"use strict";

const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { assertOwnedActiveBrand } = require("../boarding-location-assignment/brand-ownership.policy.js");

function usageFromTiming(timing) {
  if (timing?.stopBehavior === "BOARDING_ONLY") return "PICKUP";
  if (timing?.stopBehavior === "DROPPING_ONLY") return "DROP";
  return "BOTH";
}

async function getReusableSetup(ownerId, { brandId, variantId }) {
  await assertOwnedActiveBrand(ownerId, brandId);
  const setup = await FleetRouteSetup.findOne({
    ownerId, brandId, variantId, status: { $in: ["READY", "PENDING_REVIEW", "APPROVED"] },
  }).sort({ updatedAt: -1 }).lean();
  if (setup) return { source: "FLEET_SETUP", servedStops: setup.servedStops, returnEnabled: setup.returnEnabled };
  const config = await OperatorRouteConfig.findOne({ brandId, variantId, status: "ACTIVE" }).lean();
  if (!config) return null;
  const rows = await RouteStop.find({ variantId, stopId: { $in: config.activeStops || [] } })
    .select("stopId sequence").sort({ sequence: 1 }).lean();
  const timingByStop = new Map((config.timingConfig || []).map((item) => [String(item.stopId), item]));
  return {
    source: "OPERATOR_SERVICE",
    servedStops: rows.map((row) => ({
      stopId: String(row.stopId), sequence: row.sequence,
      usage: usageFromTiming(timingByStop.get(String(row.stopId))),
      boardingMode: "STOP_FALLBACK", boardingLocationIds: [],
      meetingDetails: {},
    })),
    returnEnabled: (config.returnActiveStops || []).length > 0,
  };
}

module.exports = { getReusableSetup };

"use strict";

const OperatorConfig = require(
  "../../../../models/operatorRouteConfigModel.js"
);
const RouteVariant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { recomputeTimingArray } = require("./timing.policy.js");

function deriveReturn(data) {
  const {
    activeStops, boardingConfig, timingConfig,
    returnActiveStops, returnBoardingConfig, returnTimingConfig,
  } = data;
  if (returnTimingConfig && returnTimingConfig.length > 0) {
    return {
      activeStops: returnActiveStops || [],
      boardingConfig: returnBoardingConfig || [],
      timingConfig: returnTimingConfig,
      overridden: true,
    };
  }
  return {
    activeStops: activeStops ? [...activeStops].reverse() : [],
    boardingConfig: boardingConfig ? [...boardingConfig].reverse() : [],
    timingConfig: timingConfig && timingConfig.length > 0
      ? [...timingConfig].reverse().map((timing) => ({
        stopId: timing.stopId,
        estimatedArrival: (
          timing.estimatedDeparture || timing.estimatedArrival || ""
        ).trim(),
        estimatedDeparture: (
          timing.estimatedArrival || timing.estimatedDeparture || ""
        ).trim(),
        haltDuration: timing.haltDuration ?? 5,
        dayOffset: 0,
        stopBehavior: timing.stopBehavior ?? "BOTH",
      }))
      : [],
    overridden: false,
  };
}

async function validateVariantStops(variantId, activeStops) {
  if (!activeStops || activeStops.length === 0) return;
  const variantStops = await RouteStop.find({ variantId })
    .select("stopId").lean();
  const allowed = variantStops.map((stop) => stop.stopId.toString());
  const invalid = activeStops.filter(
    (stop) => !allowed.includes(stop.toString())
  );
  if (invalid.length > 0) {
    throw new Error(`These stops are not part of this variant: ${invalid.join(", ")}`);
  }
}

async function upsertOperatorConfig(brandId, data) {
  const {
    variantId, patternName = "Standard",
    activeStops, boardingConfig, timingConfig,
  } = data;
  if (!variantId) throw new Error("variantId is required.");
  if (!patternName || patternName.trim() === "") {
    throw new Error("patternName is required.");
  }
  const variant = await RouteVariant.findById(variantId)
    .select("direction returnVariantId").lean();
  if (!variant) throw new Error("Route variant not found.");
  if (variant.direction === "RETURN") {
    throw new Error(
      "Cannot create a route config for a RETURN variant directly. " +
      "Configure the forward (A→B) variant — the return direction is stored " +
      "inline on the same config."
    );
  }
  await validateVariantStops(variantId, activeStops);
  const returnConfig = deriveReturn(data);
  const count = await OperatorConfig.countDocuments({ brandId, variantId });
  return OperatorConfig.findOneAndUpdate(
    { brandId, variantId, patternName: patternName.trim() },
    {
      brandId, variantId, patternName: patternName.trim(),
      isDefault: count === 0, activeStops, boardingConfig,
      timingConfig: recomputeTimingArray(timingConfig || []),
      returnActiveStops: returnConfig.activeStops,
      returnBoardingConfig: returnConfig.boardingConfig,
      returnTimingConfig: recomputeTimingArray(returnConfig.timingConfig || []),
      returnOverridden: returnConfig.overridden,
    },
    { upsert: true, new: true, runValidators: true }
  );
}

function getOperatorConfigs(brandId) {
  return OperatorConfig.find({ brandId, status: "ACTIVE" })
    .populate({
      path: "variantId",
      populate: {
        path: "corridorId",
        populate: [
          { path: "originId", select: "name code" },
          { path: "destinationId", select: "name code" },
        ],
      },
    })
    .populate("activeStops", "name code type")
    .sort({ variantId: 1, isDefault: -1, patternName: 1 })
    .lean();
}

function listPatternsForVariant(brandId, variantId) {
  return OperatorConfig.find({ brandId, variantId, status: "ACTIVE" })
    .select("patternName isDefault activeStops timingConfig status")
    .sort({ isDefault: -1, patternName: 1 })
    .lean();
}

module.exports = {
  upsertOperatorConfig, getOperatorConfigs, listPatternsForVariant,
};

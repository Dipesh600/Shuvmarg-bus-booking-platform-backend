"use strict";
const mongoose = require("mongoose");
const Bus = require("../../../../models/fleetModel.js");
const OperatorConfig = require("../../../../models/operatorRouteConfigModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const {
  getConfigActiveStopIds,
  getFleetSetupActiveStopIds,
  isStopActiveFromOverlay,
  normalizeCatalogOptions,
} = require("./fleet-setup-stop-overlay.js");
async function findConfig(brandId, variantId, { configId, fleetId } = {}) {
  if (configId) {
    const scope = { _id: configId, brandId, variantId };
    if (fleetId) scope.fleetId = fleetId;
    return OperatorConfig.findOne(scope).lean();
  }
  if (fleetId) {
    return await OperatorConfig.findOne({ brandId, variantId, fleetId, isDefault: true }).lean()
      || OperatorConfig.findOne({ brandId, variantId, fleetId }).lean();
  }
  return await OperatorConfig.findOne({ brandId, variantId, isDefault: true }).lean()
    || OperatorConfig.findOne({ brandId, variantId }).lean();
}
async function getAvailableVariantsForOperator(brandId, options = {}) {
  const query = { status: "ACTIVE", direction: "FORWARD" };
  if (brandId) {
    const ids = Array.isArray(options.corridorIds) && options.corridorIds.length
      ? options.corridorIds
      : await Bus.distinct("corridorId", {
        brandId, corridorId: { $ne: null },
      });
    if (ids.length === 0) return [];
    query.corridorId = { $in: ids };
  }
  const variants = await RouteVariant.find(query)
    .populate({
      path: "corridorId",
      populate: [
        { path: "originId", select: "name code" },
        { path: "destinationId", select: "name code" },
      ],
    })
    .sort({ "corridorId.code": 1, direction: 1 })
    .lean();
  const stopCounts = await RouteStop.aggregate([
    { $group: { _id: "$variantId", count: { $sum: 1 } } },
  ]);
  const stopMap = Object.fromEntries(
    stopCounts.map((row) => [row._id.toString(), row.count])
  );
  const variantIds = variants.map((variant) => variant._id);
  const patternCounts = await OperatorConfig.aggregate([
    {
      $match: {
        brandId: new mongoose.Types.ObjectId(brandId),
        variantId: { $in: variantIds },
        ...(options.fleetId
          ? { fleetId: new mongoose.Types.ObjectId(options.fleetId) }
          : {}),
      },
    },
    {
      $group: {
        _id: "$variantId", count: { $sum: 1 },
        patterns: {
          $push: {
            name: "$patternName", isDefault: "$isDefault", id: "$_id",
          },
        },
      },
    },
  ]);
  const patternMap = Object.fromEntries(patternCounts.map((row) => [
    row._id.toString(), { count: row.count, patterns: row.patterns },
  ]));
  return variants.map((variant) => ({
    ...variant,
    stopCount: stopMap[variant._id.toString()] || 0,
    configuredPatterns: patternMap[variant._id.toString()]?.patterns || [],
    patternCount: patternMap[variant._id.toString()]?.count || 0,
  }));
}
async function getVariantStopsWithConfig(variantId, brandId, optionsValue = null) {
  const options = normalizeCatalogOptions(optionsValue), config = await findConfig(brandId, variantId, options);
  const stops = await RouteStop.find({ variantId })
    .populate("stopId", "name code type")
    .sort({ sequence: 1 })
    .lean();
  const configActiveIds = getConfigActiveStopIds(config);
  const fleetSetupActiveIds = config ? [] : await getFleetSetupActiveStopIds({
    fleetId: options.fleetId,
    variantId,
  });
  return stops.map((stop) => ({
    ...stop,
    isActive: isStopActiveFromOverlay(stop.stopId._id.toString(), {
      config,
      configActiveIds,
      fleetSetupActiveIds,
    }),
    boardingPoints: config?.boardingConfig?.find(
      (item) => item.stopId?.toString() === stop.stopId._id.toString()
    )?.boardingPointIds || [],
    timing: config?.timingConfig?.find(
      (item) => item.stopId?.toString() === stop.stopId._id.toString()
    ) || null,
  }));
}

async function getReturnVariantStops(variantId, brandId, optionsValue = null) {
  const variant = await RouteVariant.findById(variantId)
    .select("returnVariantId direction").lean();
  if (!variant) throw new Error("Variant not found.");
  if (!variant.returnVariantId) {
    return { hasReturnVariant: false, stops: [], returnOverridden: false };
  }
  const config = await findConfig(brandId, variantId, normalizeCatalogOptions(optionsValue));
  const stops = await RouteStop.find({ variantId: variant.returnVariantId })
    .populate("stopId", "name code type")
    .sort({ sequence: 1 })
    .lean();
  const activeIds = config?.returnActiveStops?.map(
    (stop) => stop.toString()
  ) || [];
  return {
    hasReturnVariant: true,
    returnVariantId: variant.returnVariantId,
    returnOverridden: config?.returnOverridden || false,
    configId: config?._id || null,
    stops: stops.map((stop) => ({
      ...stop,
      isActive: activeIds.length > 0
        ? activeIds.includes(stop.stopId._id.toString()) : true,
      boardingPoints: config?.returnBoardingConfig?.find(
        (item) => item.stopId?.toString() === stop.stopId._id.toString()
      )?.boardingPointIds || [],
      timing: config?.returnTimingConfig?.find(
        (item) => item.stopId?.toString() === stop.stopId._id.toString()
      ) || null,
    })),
  };
}

module.exports = {
  getAvailableVariantsForOperator,
  getVariantStopsWithConfig,
  getReturnVariantStops,
};

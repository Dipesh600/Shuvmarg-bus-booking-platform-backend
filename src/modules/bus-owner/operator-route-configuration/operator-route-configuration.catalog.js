"use strict";

const mongoose = require("mongoose");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const { listApprovedFleetCorridorIds } = require("./operator-route-configuration.policy.js");

async function getAvailableVariantsForOwner(brandId, options = {}) {
  const corridorIds = Array.isArray(options.corridorIds) && options.corridorIds.length
    ? options.corridorIds
    : await listApprovedFleetCorridorIds(brandId);
  if (corridorIds.length === 0) return [];

  const variants = await RouteVariant.find({
    status: "ACTIVE",
    direction: "FORWARD",
    corridorId: { $in: corridorIds },
  })
    .populate({
      path: "corridorId",
      populate: [
        { path: "originId", select: "name code" },
        { path: "destinationId", select: "name code" },
      ],
    })
    .sort({ code: 1, name: 1 })
    .lean();

  const stopMap = await getStopMap(variants);
  const patternMap = await getPatternMap(brandId, variants, options.fleetId);
  return variants.map((variant) => ({
    ...variant,
    stopCount: stopMap[String(variant._id)] || 0,
    configuredPatterns: patternMap[String(variant._id)]?.patterns || [],
    patternCount: patternMap[String(variant._id)]?.count || 0,
  }));
}

async function getStopMap(variants) {
  const stopCounts = await RouteStop.aggregate([
    { $match: { variantId: { $in: variants.map((variant) => variant._id) } } },
    { $group: { _id: "$variantId", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(stopCounts.map((row) => [String(row._id), row.count]));
}

async function getPatternMap(brandId, variants, fleetId) {
  const patternCounts = await OperatorRouteConfig.aggregate([
    {
      $match: {
        brandId: new mongoose.Types.ObjectId(brandId),
        variantId: { $in: variants.map((variant) => variant._id) },
        ...(fleetId ? { fleetId: new mongoose.Types.ObjectId(fleetId) } : {}),
      },
    },
    {
      $group: {
        _id: "$variantId",
        count: { $sum: 1 },
        patterns: { $push: { id: "$_id", name: "$patternName", isDefault: "$isDefault" } },
      },
    },
  ]);
  return Object.fromEntries(patternCounts.map((row) => [
    String(row._id),
    { count: row.count, patterns: row.patterns },
  ]));
}

module.exports = { getAvailableVariantsForOwner };

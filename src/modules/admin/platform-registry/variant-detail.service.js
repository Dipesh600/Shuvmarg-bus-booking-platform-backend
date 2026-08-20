"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel.js");
const Schedule = require("../../../../models/scheduleModel.js");
const { getVariantReferenceCounts } = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

function historyConditions(variant) {
  const conditions = [];
  const corridorId = variant.corridorId?._id || variant.corridorId;
  if (variant.revisionOfVariantId) conditions.push({ _id: variant.revisionOfVariantId._id || variant.revisionOfVariantId });
  if (variant.supersededByVariantId) conditions.push({ _id: variant.supersededByVariantId._id || variant.supersededByVariantId });
  if (variant.routeFamilyId) conditions.push({ routeFamilyId: variant.routeFamilyId, direction: variant.direction });
  if (corridorId) conditions.push({ corridorId, direction: variant.direction, status: { $in: ["INACTIVE", "ARCHIVED"] } });
  return conditions;
}

function addBrand(brandMap, brand) {
  if (!brand?._id) return null;
  const id = String(brand._id);
  if (!brandMap.has(id)) {
    brandMap.set(id, {
      _id: brand._id, brandName: brand.brandName, brandCode: brand.brandCode,
      logo: brand.logo, contactPhone: brand.contactPhone, buses: [],
    });
  }
  return brandMap.get(id);
}

function referencingBrands(operatorConfigs, fleetSetups) {
  const brands = new Map();
  operatorConfigs.forEach((config) => addBrand(brands, config.brandId));
  fleetSetups.forEach((setup) => {
    const brand = addBrand(brands, setup.brandId);
    if (brand && setup.fleetId) {
      brand.buses.push({
        _id: setup.fleetId._id, busNumber: setup.fleetId.busNumber,
        name: setup.fleetId.name, status: setup.fleetId.status,
      });
    }
  });
  return Array.from(brands.values());
}

async function getVariantDetails(id) {
  const variant = await RouteVariant.findById(id)
    .populate({ path: "corridorId", populate: [{ path: "originId" }, { path: "destinationId" }] })
    .populate("returnVariantId", "code name direction status revisionNumber")
    .populate("revisionOfVariantId", "code name status revisionNumber")
    .populate("supersededByVariantId", "code name revisionNumber status")
    .populate("createdBy", "name email").lean();
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  const conditions = historyConditions(variant);
  const familyFilter = {
    _id: { $ne: variant._id }, status: { $ne: "ACTIVE" },
    ...(conditions.length ? { $or: conditions } : {}),
  };
  const [stops, references, history, configs, setups, schedules] = await Promise.all([
    RouteStop.find({ variantId: id }).populate("stopId", "name code type province district municipality coordinates").sort({ sequence: 1 }).lean(),
    getVariantReferenceCounts(id),
    RouteVariant.find(familyFilter).sort({ revisionNumber: -1, createdAt: -1 })
      .populate("createdBy", "name email").populate("supersededByVariantId", "code name revisionNumber").lean(),
    OperatorRouteConfig.find({ variantId: id }).populate("brandId", "brandName brandCode logo contactPhone baseCity").lean(),
    FleetRouteSetup.find({ $or: [{ variantId: id }, { returnVariantId: id }] })
      .populate("brandId", "brandName brandCode logo").populate("fleetId", "busNumber name status").lean(),
    Schedule.find({ variantId: id, status: "ACTIVE" }).select("_id scheduleCode operatorId status").lean(),
  ]);
  const historyIds = history.map((item) => item._id);
  const counts = historyIds.length ? await RouteStop.aggregate([
    { $match: { variantId: { $in: historyIds } } },
    { $group: { _id: "$variantId", count: { $sum: 1 } } },
  ]) : [];
  const countMap = Object.fromEntries(counts.map((item) => [String(item._id), item.count]));
  return {
    variant, stops, references, referencingBrands: referencingBrands(configs, setups),
    activeScheduleCount: schedules.length,
    revisionHistory: history.map((item) => ({ ...item, stopCount: countMap[String(item._id)] || 0 })),
  };
}

module.exports = { getVariantDetails };

"use strict";

const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");

const normalizeId = (value) => value && String(value._id || value.id || value);

const scopedPatternFilter = ({ brandId, variantId, fleetId, extra = {} }) => ({
  brandId,
  ...(variantId ? { variantId } : {}),
  ...(fleetId ? { fleetId } : {}),
  ...extra,
});

async function materializePatternForFleet(config, fleetId) {
  if (!fleetId || normalizeId(config.fleetId) === normalizeId(fleetId)) return config._id;
  if (config.fleetId) {
    throw new Error("The selected route pattern belongs to a different bus.");
  }
  const fields = [
    "activeStops", "boardingConfig", "timingConfig",
    "returnActiveStops", "returnBoardingConfig", "returnTimingConfig",
    "returnOverridden", "minimumJourneyMinutes", "notes",
  ];
  const copied = Object.fromEntries(fields.map((key) => [key, config[key]]));
  const fleetConfig = await OperatorRouteConfig.findOneAndUpdate(
    {
      brandId: config.brandId,
      variantId: config.variantId,
      fleetId,
      patternName: config.patternName,
    },
    {
      $setOnInsert: {
        ...copied,
        brandId: config.brandId,
        variantId: config.variantId,
        fleetId,
        patternName: config.patternName,
        status: "ACTIVE",
        isDefault: Boolean(config.isDefault),
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  return fleetConfig._id;
}

const validateExplicitPattern = async (
  operatorRouteConfigId,
  brandId,
  variantId,
  fleetId
) => {
  const config = await OperatorRouteConfig.findOne({
    _id: operatorRouteConfigId,
    brandId,
    status: "ACTIVE",
  })
    .lean();
  if (!config) {
    throw new Error(
      "The provided route pattern (operatorRouteConfigId) was not found or is not ACTIVE " +
        "for this bus. Verify the bus setup has completed stops and timings."
    );
  }
  if (variantId && normalizeId(config.variantId) !== normalizeId(variantId)) {
    const forward = await RouteVariant.findById(config.variantId)
      .select("returnVariantId")
      .lean();
    if (!forward || normalizeId(forward.returnVariantId) !== normalizeId(variantId)) {
      throw new Error(
        "Route pattern mismatch: the provided operatorRouteConfigId belongs to a different " +
          "variant than the provided variantId."
      );
    }
  }
  return materializePatternForFleet(config, fleetId);
};

const resolveDefaultPattern = async (brandId, variantId, fleetId) => {
  let config = await OperatorRouteConfig.findOne(scopedPatternFilter({
    brandId,
    variantId,
    fleetId,
    extra: { isDefault: true, status: "ACTIVE" },
  }))
    .select("_id fleetId patternName")
    .lean();
  if (config) return config._id;
  let patterns = await OperatorRouteConfig.find(scopedPatternFilter({
    brandId,
    variantId,
    fleetId,
    extra: { status: "ACTIVE" },
  }))
    .select("_id fleetId patternName")
    .lean();
  if (patterns.length === 0 && fleetId) {
    config = await OperatorRouteConfig.findOne({
      brandId, variantId, fleetId: null, isDefault: true, status: "ACTIVE",
    }).lean();
    if (config) return materializePatternForFleet(config, fleetId);
    patterns = await OperatorRouteConfig.find({
      brandId, variantId, fleetId: null, status: "ACTIVE",
    }).lean();
  }
  if (patterns.length === 0) {
    throw new Error(
      "Brand has no ACTIVE route configuration for this variant. " +
        "Open this bus setup and complete stops and timings first."
    );
  }
  if (patterns.length === 1) return materializePatternForFleet(patterns[0], fleetId);
  const names = patterns.map((pattern) => `"${pattern.patternName}"`).join(", ");
  throw new Error(
    `Multiple route patterns exist for this variant (${names}) but none is marked as default. ` +
      "Either set a default pattern in Route Services, or provide operatorRouteConfigId explicitly " +
      "to select the specific pattern for this schedule."
  );
};

const resolveRoutePattern = (data) => {
  const fleetId = data.busId || data.fleetId || null;
  if (data.operatorRouteConfigId) {
    return validateExplicitPattern(
      data.operatorRouteConfigId,
      data.brandId,
      data.variantId,
      fleetId
    );
  }
  if (data.variantId) return resolveDefaultPattern(data.brandId, data.variantId, fleetId);
  return null;
};

module.exports = { resolveRoutePattern };

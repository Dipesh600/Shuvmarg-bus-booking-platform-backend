"use strict";

const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");

const validateExplicitPattern = async (
  operatorRouteConfigId,
  brandId,
  variantId
) => {
  const config = await OperatorRouteConfig.findOne({
    _id: operatorRouteConfigId,
    brandId,
    status: "ACTIVE",
  })
    .select("_id variantId patternName")
    .lean();
  if (!config) {
    throw new Error(
      "The provided route pattern (operatorRouteConfigId) was not found or is not ACTIVE " +
        "for this brand. Verify the pattern exists in Route Services."
    );
  }
  if (variantId && config.variantId?.toString() !== variantId.toString()) {
    const forward = await RouteVariant.findById(config.variantId)
      .select("returnVariantId")
      .lean();
    if (!forward || forward.returnVariantId?.toString() !== variantId.toString()) {
      throw new Error(
        "Route pattern mismatch: the provided operatorRouteConfigId belongs to a different " +
          "variant than the provided variantId."
      );
    }
  }
  return config._id;
};

const resolveDefaultPattern = async (brandId, variantId) => {
  let config = await OperatorRouteConfig.findOne({
    brandId,
    variantId,
    isDefault: true,
    status: "ACTIVE",
  })
    .select("_id patternName")
    .lean();
  if (config) return config._id;
  const patterns = await OperatorRouteConfig.find({
    brandId,
    variantId,
    status: "ACTIVE",
  })
    .select("_id patternName")
    .lean();
  if (patterns.length === 0) {
    throw new Error(
      "Brand has no ACTIVE route configuration for this variant. " +
        "Go to Route Services → Add Service Pattern on this route first."
    );
  }
  if (patterns.length === 1) return patterns[0]._id;
  const names = patterns.map((pattern) => `"${pattern.patternName}"`).join(", ");
  throw new Error(
    `Multiple route patterns exist for this variant (${names}) but none is marked as default. ` +
      "Either set a default pattern in Route Services, or provide operatorRouteConfigId explicitly " +
      "to select the specific pattern for this schedule."
  );
};

const resolveRoutePattern = (data) => {
  if (data.operatorRouteConfigId) {
    return validateExplicitPattern(
      data.operatorRouteConfigId,
      data.brandId,
      data.variantId
    );
  }
  if (data.variantId) return resolveDefaultPattern(data.brandId, data.variantId);
  return null;
};

module.exports = { resolveRoutePattern };

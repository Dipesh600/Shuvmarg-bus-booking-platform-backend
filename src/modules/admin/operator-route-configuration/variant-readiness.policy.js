"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");

function failure(statusCode, message, code, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

async function assertVariantReadyForOperatorConfig(variantId, deps = {}) {
  const VariantModel = deps.RouteVariantModel || RouteVariant;
  const RouteStopModel = deps.RouteStopModel || RouteStop;
  const variant = await VariantModel.findById(variantId)
    .select("_id code direction status originTerminalStopId destinationTerminalStopId")
    .lean();
  if (!variant) {
    throw failure(404, "Route variant not found.", "ROUTE_VARIANT_NOT_FOUND", {
      variantId,
    });
  }
  if (variant.direction === "RETURN") {
    throw failure(
      400,
      "Cannot create a route config for a RETURN variant directly. Configure the forward (A→B) variant — the return direction is stored inline on the same config.",
      "RETURN_VARIANT_CONFIG_FORBIDDEN",
      { variantId }
    );
  }
  if (variant.status !== "ACTIVE") {
    throw failure(
      409,
      "Route configuration requires an ACTIVE route variant.",
      "ROUTE_VARIANT_NOT_ACTIVE",
      { variantId, status: variant.status }
    );
  }
  if (!variant.originTerminalStopId || !variant.destinationTerminalStopId) {
    throw failure(
      409,
      "Route configuration requires a variant with reviewed physical terminal stops.",
      "ROUTE_VARIANT_TERMINALS_REQUIRED",
      { variantId }
    );
  }
  const routeStopCount = await RouteStopModel.countDocuments({ variantId });
  if (routeStopCount < 2) {
    throw failure(
      409,
      "Route configuration requires a variant with at least two route stops.",
      "ROUTE_VARIANT_SEQUENCE_INCOMPLETE",
      { variantId, routeStopCount }
    );
  }
  return { variant, routeStopCount };
}

module.exports = { assertVariantReadyForOperatorConfig };

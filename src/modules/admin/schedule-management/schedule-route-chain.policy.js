"use strict";

const Fleet = require("../../../../models/fleetModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");

function routeChainError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || null;
}

function query(model, method, fallback) {
  return model?.[method] || fallback;
}

function assertPatternMatchesVariant(config, variant) {
  const configVariantId = id(config.variantId);
  const variantId = id(variant._id);
  const returnVariantId = id(variant.returnVariantId);
  if (configVariantId === variantId || configVariantId === returnVariantId) return;
  throw routeChainError(
    "SCHEDULE_ROUTE_PATTERN_MISMATCH",
    "The schedule route pattern does not belong to the selected route variant.",
    { configVariantId, variantId }
  );
}

async function assertScheduleRouteChainReady(schedule, deps = {}) {
  const models = {
    FleetModel: deps.FleetModel || Fleet,
    OperatorRouteConfigModel: deps.OperatorRouteConfigModel || OperatorRouteConfig,
    RouteStopModel: deps.RouteStopModel || RouteStop,
    RouteVariantModel: deps.RouteVariantModel || RouteVariant,
  };
  if (!schedule?.variantId) {
    throw routeChainError("SCHEDULE_VARIANT_REQUIRED", "Schedule must reference an active route variant.");
  }
  if (!schedule.operatorRouteConfigId) {
    throw routeChainError(
      "SCHEDULE_ROUTE_PATTERN_REQUIRED",
      "Schedule must reference an active operator route configuration."
    );
  }
  const variant = await query(models.RouteVariantModel, "findById")(schedule.variantId)
    .select("_id status returnVariantId")
    .lean();
  if (!variant || variant.status !== "ACTIVE") {
    throw routeChainError(
      "SCHEDULE_VARIANT_NOT_ACTIVE",
      "Schedule cannot operate because its route variant is not ACTIVE.",
      { variantId: id(schedule.variantId), status: variant?.status || null }
    );
  }
  const config = await query(models.OperatorRouteConfigModel, "findById")(schedule.operatorRouteConfigId)
    .select("_id variantId status")
    .lean();
  if (!config || config.status !== "ACTIVE") {
    throw routeChainError(
      "SCHEDULE_ROUTE_PATTERN_NOT_ACTIVE",
      "Schedule cannot operate because its route pattern is not ACTIVE.",
      { operatorRouteConfigId: id(schedule.operatorRouteConfigId), status: config?.status || null }
    );
  }
  assertPatternMatchesVariant(config, variant);
  const routeStopCount = await query(models.RouteStopModel, "countDocuments")({
    variantId: schedule.variantId,
  });
  if (routeStopCount < 2) {
    throw routeChainError(
      "SCHEDULE_VARIANT_SEQUENCE_INCOMPLETE",
      "Schedule cannot operate because its route variant does not have a usable stop sequence.",
      { variantId: id(schedule.variantId), routeStopCount }
    );
  }
  const fleet = await query(models.FleetModel, "findById")(schedule.busId)
    .select("_id approvalStatus status busNumber")
    .lean();
  if (!fleet || fleet.approvalStatus !== "APPROVED" || fleet.status !== "ACTIVE") {
    throw routeChainError(
      "SCHEDULE_FLEET_NOT_OPERATIONAL",
      "Schedule cannot operate because its fleet is not approved and active.",
      {
        busId: id(schedule.busId),
        approvalStatus: fleet?.approvalStatus || null,
        status: fleet?.status || null,
      }
    );
  }
  return { variant, config, fleet, routeStopCount };
}

module.exports = { assertScheduleRouteChainReady, routeChainError };

"use strict";

const mongoose = require("mongoose");
const Bus = require("../../../../models/fleetModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const { assertOwnedActiveBrand } = require("../boarding-location-assignment/brand-ownership.policy.js");
const { operatorRouteConfigError } = require("./operator-route-configuration.errors.js");

const ALLOWED_SERVICE_TYPES = new Set([
  "Standard",
  "Express",
  "Night Bus",
  "Local / All-stop",
  "Deluxe",
]);

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value.id || value);
}

function normalizeOperatorServiceType(value) {
  const patternName = String(value || "Standard").trim();
  if (ALLOWED_SERVICE_TYPES.has(patternName)) return patternName;
  throw operatorRouteConfigError(
    "INVALID_ROUTE_SERVICE_TYPE",
    "Choose a valid service type for this bus.",
    400
  );
}

function assertObjectId(value, code, message) {
  if (!mongoose.isValidObjectId(value)) {
    throw operatorRouteConfigError(code, message, 400);
  }
}

async function assertOwnedBrand(ownerId, brandId) {
  return assertOwnedActiveBrand(ownerId, brandId);
}

async function listApprovedFleetCorridorIds(brandId) {
  const ids = await Bus.distinct("corridorId", {
    brandId,
    approvalStatus: "APPROVED",
    corridorId: { $ne: null },
  });
  return ids.map(String);
}

async function assertVariantBelongsToApprovedFleetCorridor(brandId, variantId) {
  assertObjectId(variantId, "INVALID_ROUTE_VARIANT", "Select a valid route variant.");
  const [variant, allowedCorridorIds] = await Promise.all([
    RouteVariant.findById(variantId).select("_id corridorId status direction").lean(),
    listApprovedFleetCorridorIds(brandId),
  ]);

  if (!variant) {
    throw operatorRouteConfigError("ROUTE_VARIANT_NOT_FOUND", "Route variant not found.", 404);
  }
  if (!allowedCorridorIds.includes(normalizeId(variant.corridorId))) {
    throw operatorRouteConfigError(
      "ROUTE_VARIANT_NOT_ASSIGNED",
      "This route is not assigned to one of your approved buses.",
      403
    );
  }
  return variant;
}

async function assertOwnedApprovedFleet(ownerId, { brandId, fleetId } = {}) {
  assertObjectId(fleetId, "INVALID_FLEET", "Select a valid bus.");
  const fleet = await Bus.findOne({
    _id: fleetId,
    brandId,
    ownerId,
    approvalStatus: "APPROVED",
    corridorId: { $ne: null },
  }).select("_id brandId corridorId approvalStatus").lean();

  if (!fleet) {
    throw operatorRouteConfigError(
      "FLEET_NOT_READY_FOR_ROUTE_SETUP",
      "This bus is not approved for route setup.",
      403
    );
  }
  return fleet;
}

async function assertOwnedApprovedFleetForVariant(ownerId, { brandId, fleetId, variantId } = {}) {
  assertObjectId(variantId, "INVALID_ROUTE_VARIANT", "Select a valid route variant.");
  const [fleet, variant] = await Promise.all([
    assertOwnedApprovedFleet(ownerId, { brandId, fleetId }),
    RouteVariant.findById(variantId).select("_id corridorId status direction").lean(),
  ]);

  if (!variant) {
    throw operatorRouteConfigError("ROUTE_VARIANT_NOT_FOUND", "Route variant not found.", 404);
  }
  if (normalizeId(fleet.corridorId) !== normalizeId(variant.corridorId)) {
    throw operatorRouteConfigError(
      "ROUTE_VARIANT_NOT_ASSIGNED_TO_FLEET",
      "This route is not assigned to this bus.",
      403
    );
  }
  return { fleet, variant };
}

async function assertConfigBelongsToOwnedBrand(ownerId, configId, expected = {}) {
  assertObjectId(configId, "INVALID_ROUTE_CONFIG", "Select a valid route configuration.");
  const config = await OperatorRouteConfig.findById(configId)
    .select("_id brandId variantId fleetId status")
    .lean();
  if (!config) {
    throw operatorRouteConfigError("ROUTE_CONFIG_NOT_FOUND", "Route configuration not found.", 404);
  }
  await assertOwnedBrand(ownerId, normalizeId(config.brandId));
  if (expected.brandId && normalizeId(config.brandId) !== String(expected.brandId)) {
    throw operatorRouteConfigError("ROUTE_CONFIG_BRAND_MISMATCH", "Route configuration does not belong to this brand.", 403);
  }
  if (expected.variantId && normalizeId(config.variantId) !== String(expected.variantId)) {
    throw operatorRouteConfigError("ROUTE_CONFIG_VARIANT_MISMATCH", "Route configuration does not belong to this route.", 403);
  }
  if (expected.fleetId && normalizeId(config.fleetId) !== String(expected.fleetId)) {
    throw operatorRouteConfigError("ROUTE_CONFIG_FLEET_MISMATCH", "Route configuration does not belong to this bus.", 403);
  }
  return config;
}

module.exports = {
  assertOwnedBrand,
  assertVariantBelongsToApprovedFleetCorridor,
  assertOwnedApprovedFleet,
  assertOwnedApprovedFleetForVariant,
  assertConfigBelongsToOwnedBrand,
  listApprovedFleetCorridorIds,
  normalizeId,
  normalizeOperatorServiceType,
};

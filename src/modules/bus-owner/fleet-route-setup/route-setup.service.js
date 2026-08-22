"use strict";
const mongoose = require("mongoose");
const Bus = require("../../../../models/fleetModel.js");
const Variant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel.js");
const { fleetRouteError } = require("./fleet-route-errors.js");
const { validateUnresolvedPlaces } = require("./route-unresolved-places.validation.js");
const { isLegacyOverallRejection } = require("../../fleet-management/fleet-review-state.js");
const {
  validateServedStopInput,
  validateEndpoints,
  sanitizeText,
  validateCoordinates,
} = require("./route-setup.validation.js");
async function validateFleet(ownerId, fleetId, brandId) {
  if (!mongoose.isValidObjectId(fleetId)) throw fleetRouteError("INVALID_FLEET", "Select a valid fleet.");
  const fleet = await Bus.findOne({ _id: fleetId, ownerId })
    .select("brandId approvalStatus documentReviews sectionReviews")
    .lean();
  if (!fleet) throw fleetRouteError("FLEET_NOT_FOUND", "Fleet not found.", 404);
  if (String(fleet.brandId) !== String(brandId)) {
    throw fleetRouteError("FLEET_ROUTE_BRAND_MISMATCH", "This route does not belong to the fleet brand.", 403);
  }
  if (fleet.approvalStatus === "APPROVED") {
    throw fleetRouteError("FLEET_ROUTE_NOT_EDITABLE", "Create a revision to change a reviewed fleet route.", 409);
  }
  if (
    fleet.approvalStatus === "REJECTED"
    && !isLegacyOverallRejection(fleet)
    && fleet.sectionReviews?.routeSetup?.status !== "rejected"
  ) {
    throw fleetRouteError("FLEET_ROUTE_NOT_REJECTED", "The route setup was accepted and cannot be changed in this correction round.", 409);
  }
  return fleet;
}
async function validateResolvedRoute(data) {
  if (data.resolutionStatus !== "AVAILABLE") return { returnVariantId: null, allowedStopIds: null };
  const variant = await Variant.findOne({
    _id: data.variantId, corridorId: data.corridorId, status: "ACTIVE", direction: data.direction,
  }).lean();
  if (!variant) throw fleetRouteError("ROUTE_VARIANT_UNAVAILABLE", "The selected road path is unavailable.", 409);
  let returnVariantId = null;
  if (data.returnEnabled) {
    const linked = variant.returnVariantId && await Variant.findOne({
      _id: variant.returnVariantId, corridorId: variant.corridorId, status: "ACTIVE",
      direction: variant.direction === "FORWARD" ? "RETURN" : "FORWARD",
    }).select("_id").lean();
    returnVariantId = linked?._id || null;
  }
  validateServedStopInput(data.servedStops);
  const rows = await RouteStop.find({ variantId: variant._id }).select("stopId sequence").lean();
  const allowed = new Map(rows.map((row) => [String(row.stopId), row.sequence]));
  for (const item of data.servedStops) {
    if (!allowed.has(String(item.stopId)) || allowed.get(String(item.stopId)) !== item.sequence) {
      throw fleetRouteError("STOP_NOT_ON_VARIANT", "A selected stop is not part of this road path.", 409);
    }
  }
  const locationIds = data.servedStops.flatMap((item) => item.boardingLocationIds || []);
  if (locationIds.length) {
    const locations = await BoardingLocation.find({
      _id: { $in: locationIds }, status: "ACTIVE", verificationStatus: "VERIFIED",
    }).select("_id stopId").lean();
    const locationById = new Map(locations.map((item) => [String(item._id), String(item.stopId)]));
    for (const item of data.servedStops) {
      for (const id of item.boardingLocationIds || []) {
        if (locationById.get(String(id)) !== String(item.stopId)) {
          throw fleetRouteError("BOARDING_LOCATION_UNAVAILABLE", "A meeting place is unavailable for its stop.", 409);
        }
      }
    }
  }
  return { returnVariantId, allowedStopIds: new Set(allowed.keys()) };
}
async function saveRouteSetup(ownerId, fleetId, data) {
  const fleet = await validateFleet(ownerId, fleetId, data.brandId);
  validateEndpoints(data);
  const isCanonicalOrigin = mongoose.isValidObjectId(data.originStopId);
  const isCanonicalDestination = mongoose.isValidObjectId(data.destinationStopId);
  const customOrigin = data.customOrigin ? {
    name: sanitizeText(data.customOrigin.name, 150),
    address: sanitizeText(data.customOrigin.address, 500),
    coordinates: validateCoordinates(data.customOrigin.coordinates),
  } : null;
  const customDestination = data.customDestination ? {
    name: sanitizeText(data.customDestination.name, 150),
    address: sanitizeText(data.customDestination.address, 500),
    coordinates: validateCoordinates(data.customDestination.coordinates),
  } : null;
  const resolutionStatus = (!isCanonicalOrigin || !isCanonicalDestination || data.resolutionStatus !== "AVAILABLE")
    ? "NEEDS_PLATFORM_REVIEW"
    : "AVAILABLE";
  const cleanData = {
    ...data,
    originStopId: isCanonicalOrigin ? data.originStopId : null,
    destinationStopId: isCanonicalDestination ? data.destinationStopId : null,
    customOrigin,
    customDestination,
    resolutionStatus,
  };
  const { returnVariantId, allowedStopIds } = await validateResolvedRoute(cleanData);
  await validateUnresolvedPlaces(cleanData, allowedStopIds);
  const unresolvedPlaces = Array.isArray(cleanData.unresolvedPlaces) ? cleanData.unresolvedPlaces : [];
  const ready = cleanData.resolutionStatus === "AVAILABLE"
    && unresolvedPlaces.length === 0
    && (!cleanData.returnEnabled || returnVariantId);
  const update = {
    ...cleanData, ownerId, fleetId, returnVariantId,
    status: ready ? "READY" : "DRAFT",
  };
  const saved = await FleetRouteSetup.findOneAndUpdate(
    { fleetId, ownerId },
    { $set: update, $inc: { revision: 1 } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  if (fleet.approvalStatus === "REJECTED") {
    await Bus.updateOne({ _id: fleetId, ownerId }, { $set: {
      "sectionReviews.routeSetup": { status: "not_submitted", reason: null, reviewedBy: null, reviewedAt: null },
    } });
  }
  return saved;
}
function getRouteSetup(ownerId, fleetId) {
  return FleetRouteSetup.findOne({ fleetId, ownerId }).lean();
}
module.exports = { saveRouteSetup, getRouteSetup, validateResolvedRoute };

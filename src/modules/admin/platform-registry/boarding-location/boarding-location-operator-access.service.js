"use strict";

const mongoose = require("mongoose");
const BoardingLocation = require("../../../../../models/boardingLocationModel.js");
const Assignment = require("../../../../../models/operatorBoardingAssignmentModel.js");
const OperatorBrand = require("../../../../../models/operatorBrandModel.js");
const OperatorRouteConfig = require("../../../../../models/operatorRouteConfigModel.js");
const { boardingLocationError } = require(
  "../../../../domain/boarding-location/boarding-location-errors.js"
);

const idOf = (value) => String(value?._id || value || "");

async function eligibleLocation(locationId) {
  if (!mongoose.isValidObjectId(locationId)) {
    throw boardingLocationError("INVALID_BOARDING_LOCATION", "Select a valid boarding location.", 400);
  }
  const location = await BoardingLocation.findOne({
    _id: locationId, status: "ACTIVE", verificationStatus: "VERIFIED",
  }).lean();
  if (!location) {
    throw boardingLocationError(
      "BOARDING_LOCATION_UNAVAILABLE", "Verify and activate this boarding place first.", 409
    );
  }
  return location;
}

async function servingBrands(stopId) {
  const brandIds = await OperatorRouteConfig.distinct("brandId", {
    status: "ACTIVE", $or: [{ activeStops: stopId }, { returnActiveStops: stopId }],
  });
  return OperatorBrand.find({ _id: { $in: brandIds }, status: "ACTIVE" })
    .select("brandName brandCode").sort({ brandName: 1 }).lean();
}

function mapAccess(brand, assignment) {
  return {
    brandId: idOf(brand), brandName: brand.brandName, brandCode: brand.brandCode,
    assignmentId: assignment ? idOf(assignment) : null,
    usage: assignment?.usage || "BOTH", status: assignment?.status || "NOT_ASSIGNED",
  };
}

async function listOperatorAccess(locationId) {
  const location = await eligibleLocation(locationId);
  const brands = await servingBrands(location.stopId);
  const assignments = await Assignment.find({
    boardingLocationId: location._id, brandId: { $in: brands.map((brand) => brand._id) },
  }).lean();
  const byBrand = new Map(assignments.map((item) => [idOf(item.brandId), item]));
  return brands.map((brand) => mapAccess(brand, byBrand.get(idOf(brand))));
}

async function enableOperatorAccess(locationId, data, adminId) {
  const location = await eligibleLocation(locationId);
  if (!mongoose.isValidObjectId(data.brandId) || !["PICKUP", "DROP", "BOTH"].includes(data.usage)) {
    throw boardingLocationError("INVALID_BOARDING_ASSIGNMENT", "Select an operator and valid usage.", 400);
  }
  const brand = await OperatorBrand.findOne({ _id: data.brandId, status: "ACTIVE" }).lean();
  const servesStop = brand && await OperatorRouteConfig.exists({
    brandId: brand._id, status: "ACTIVE",
    $or: [{ activeStops: location.stopId }, { returnActiveStops: location.stopId }],
  });
  if (!servesStop) {
    throw boardingLocationError("ROUTE_STOP_NOT_SERVED", "This operator does not serve the route stop.", 409);
  }
  const assignment = await Assignment.findOneAndUpdate(
    { brandId: brand._id, boardingLocationId: location._id },
    { $set: { usage: data.usage, status: "ACTIVE", reviewedBy: adminId,
      reviewedAt: new Date(), rejectionReason: null }, $setOnInsert: { createdBy: adminId } },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return mapAccess(brand, assignment);
}

module.exports = { listOperatorAccess, enableOperatorAccess };

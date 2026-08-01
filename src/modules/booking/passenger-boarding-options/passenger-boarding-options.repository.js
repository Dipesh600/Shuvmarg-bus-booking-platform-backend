"use strict";

const Trip = require("../../../../models/tripModel.js");
const Stop = require("../../../../models/stopModel.js");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const Assignment = require("../../../../models/operatorBoardingAssignmentModel.js");

function findTripBoardingContext(tripId) {
  return Trip.findOne({
    _id: tripId,
    isActive: true,
    status: "scheduled",
    bookingClosesAt: { $gt: new Date() },
  }).select("brandId scheduleId variantId")
    .populate("variantId", "direction")
    .populate({
      path: "scheduleId", select: "operatorRouteConfigId",
      populate: {
        path: "operatorRouteConfigId",
        select: "activeStops returnActiveStops timingConfig returnTimingConfig status",
      },
    }).lean();
}

function findStops(stopIds) {
  return Stop.find({ _id: { $in: stopIds } }).lean();
}

function findChildStops(parentStopId) {
  return Stop.find({
    parentStopId,
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
    isRouteStop: true,
  }).sort({ name: 1 }).lean();
}

async function findOperatorAssignments(brandId, stopIds) {
  const locations = await BoardingLocation.find({
    stopId: { $in: stopIds }, status: "ACTIVE", verificationStatus: "VERIFIED",
  }).lean();
  if (locations.length === 0) return [];
  return Assignment.find({
    brandId, status: "ACTIVE",
    boardingLocationId: { $in: locations.map((location) => location._id) },
  }).populate("boardingLocationId").lean();
}

module.exports = {
  findTripBoardingContext, findStops, findChildStops, findOperatorAssignments,
};

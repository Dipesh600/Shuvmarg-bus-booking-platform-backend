"use strict";

const mongoose = require("mongoose");
const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const Stop = require("../../../../models/stopModel.js");
const { fleetRouteError } = require("./fleet-route-errors.js");

async function listBoardingLocations(stopId) {
  if (!mongoose.isValidObjectId(stopId)) {
    throw fleetRouteError("INVALID_ROUTE_STOP", "Select a valid route stop.");
  }
  const stop = await Stop.findOne({
    _id: stopId, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
  }).select("name code coordinates district province municipality").lean();
  if (!stop) throw fleetRouteError("ROUTE_STOP_UNAVAILABLE", "This route stop is unavailable.", 409);
  const locations = await BoardingLocation.find({
    stopId, status: "ACTIVE", verificationStatus: "VERIFIED",
  }).select("name landmark address coordinates").sort({ name: 1 }).lean();
  return {
    stop: {
      id: String(stop._id), name: stop.name, code: stop.code,
      district: stop.district || null, municipality: stop.municipality || null,
      province: stop.province || null, coordinates: stop.coordinates || null,
    },
    locations: locations.map((item) => ({
      id: String(item._id), name: item.name, landmark: item.landmark || null,
      address: item.address || null, coordinates: item.coordinates || null,
    })),
  };
}

module.exports = { listBoardingLocations };

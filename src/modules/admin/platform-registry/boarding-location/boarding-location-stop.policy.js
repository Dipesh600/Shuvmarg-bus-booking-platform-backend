"use strict";

const mongoose = require("mongoose");
const Stop = require("../../../../../models/stopModel.js");
const {
  boardingLocationError,
} = require("../../../../domain/boarding-location/boarding-location-errors.js");

async function resolveOperationalStop({ stopId, stopCode }) {
  let query;
  if (stopId) {
    if (!mongoose.isValidObjectId(stopId)) {
      throw boardingLocationError(
        "INVALID_BOARDING_LOCATION_STOP", "The selected route stop is invalid."
      );
    }
    query = { _id: stopId };
  } else if (stopCode) {
    query = { code: String(stopCode).trim().toUpperCase() };
  } else {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_STOP", "A parent route stop is required."
    );
  }
  const stop = await Stop.findOne(query).lean();
  if (!stop) {
    throw boardingLocationError(
      "BOARDING_LOCATION_STOP_NOT_FOUND", "The selected route stop was not found.", 404
    );
  }
  if (stop.status !== "ACTIVE" || stop.isRouteStop !== true) {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_STOP",
      "Boarding locations require an active operational route stop."
    );
  }
  return stop;
}

module.exports = { resolveOperationalStop };

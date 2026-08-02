"use strict";

const mongoose = require("mongoose");
const {
  boardingLocationError,
} = require("../../../../domain/boarding-location/boarding-location-errors.js");

function assertBoardingLocationId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_ID", "Boarding location ID is invalid."
    );
  }
  return id;
}

module.exports = { assertBoardingLocationId };

"use strict";

const mongoose = require("mongoose");
const Stop = require("../../../../../models/stopModel.js");
const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

function assertCorridorEndpoint(stop, label = "Corridor endpoint") {
  if (!stop) {
    throw corridorError(
      "CORRIDOR_ENDPOINT_NOT_FOUND", `${label} was not found.`, 404
    );
  }
  if (stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" ||
      stop.isSearchable !== true) {
    throw corridorError(
      "INVALID_CORRIDOR_ENDPOINT",
      `${label} must be active, verified and passenger-searchable.`,
      400,
      { stopId: String(stop._id), status: stop.status,
        verificationStatus: stop.verificationStatus,
        isSearchable: stop.isSearchable }
    );
  }
  return stop;
}

async function resolveCorridorEndpoint({ stopId, stopCode }, label) {
  let query;
  if (stopId) {
    if (!mongoose.isValidObjectId(stopId)) {
      throw corridorError(
        "INVALID_CORRIDOR_ENDPOINT", `${label} ID is invalid.`
      );
    }
    query = { _id: stopId };
  } else if (stopCode) {
    query = { code: String(stopCode).trim().toUpperCase() };
  } else {
    throw corridorError(
      "INVALID_CORRIDOR_ENDPOINT", `${label} is required.`
    );
  }
  return assertCorridorEndpoint(await Stop.findOne(query).lean(), label);
}

module.exports = { assertCorridorEndpoint, resolveCorridorEndpoint };

"use strict";

const { boardingLocationError } = require("./boarding-location-errors.js");

function normalizeIdentityPart(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function buildBoardingLocationIdentity({ stopId, name }) {
  const normalizedStopId = normalizeIdentityPart(stopId?._id || stopId);
  const normalizedName = normalizeIdentityPart(name);
  if (!normalizedStopId) {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_STOP",
      "A parent route stop is required."
    );
  }
  if (!normalizedName) {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_NAME",
      "Boarding location name is required."
    );
  }
  return `${normalizedStopId}:${normalizedName}`;
}

module.exports = { buildBoardingLocationIdentity, normalizeIdentityPart };

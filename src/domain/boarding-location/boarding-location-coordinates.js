"use strict";

const { boardingLocationError } = require("./boarding-location-errors.js");

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBoardingCoordinates(coordinates) {
  const lat = normalizeCoordinate(coordinates?.lat);
  const lng = normalizeCoordinate(coordinates?.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 ||
      lng < -180 || lng > 180) {
    throw boardingLocationError(
      "INVALID_BOARDING_LOCATION_COORDINATES",
      "Select a valid boarding location on the map."
    );
  }
  return { lat, lng };
}

function toGeoPoint(coordinates) {
  const { lat, lng } = normalizeBoardingCoordinates(coordinates);
  return { type: "Point", coordinates: [lng, lat] };
}

module.exports = { normalizeBoardingCoordinates, toGeoPoint };

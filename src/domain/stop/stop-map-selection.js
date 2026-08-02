"use strict";

const { validateCoordinates } = require("./stop-coordinate-validation");

const MAP_COORDINATE_SOURCES = [
  "GOOGLE_PLACE", "MAP_PIN", "ADMIN_GPS", "DISCOVERY",
];

function stopMapError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function assertInteractiveMapSelection(data) {
  const coordinateError = validateCoordinates(data.coordinates);
  if (coordinateError) throw coordinateError;
  const { lat, lng } = data.coordinates || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw stopMapError(
      "STOP_MAP_LOCATION_REQUIRED",
      "Select the stop position on the map before saving."
    );
  }
  if (!MAP_COORDINATE_SOURCES.includes(data.coordinateSource)) {
    throw stopMapError(
      "INVALID_STOP_COORDINATE_SOURCE",
      "The stop position must come from map search, a map pin, or captured GPS."
    );
  }
}

function coordinateWriteFields(data) {
  return {
    coordinates: data.coordinates,
    coordinateSource: data.coordinateSource,
    coordinateAccuracyMeters: data.coordinateAccuracyMeters ?? null,
    coordinateCapturedAt: data.coordinateCapturedAt || new Date(),
    coordinateProvider: data.coordinateProvider || null,
    coordinatePlaceId: data.coordinatePlaceId || null,
    coordinateSuggestedAddress: data.coordinateSuggestedAddress || null,
  };
}

module.exports = {
  MAP_COORDINATE_SOURCES, assertInteractiveMapSelection, coordinateWriteFields,
};

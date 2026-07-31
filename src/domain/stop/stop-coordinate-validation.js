"use strict";

function validateCoordinates(coordinates) {
  if (!coordinates) return null;
  const { lat, lng } = coordinates;
  if ((lat === null && lng !== null) || (lat !== null && lng === null)) {
    const err = new Error("Both latitude and longitude must be provided, or both must be null.");
    err.code = "INVALID_STOP_COORDINATES";
    err.statusCode = 400;
    return err;
  }
  if (lat !== null && (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90)) {
    const err = new Error("Invalid latitude value.");
    err.code = "INVALID_STOP_COORDINATES";
    err.statusCode = 400;
    return err;
  }
  if (lng !== null && (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180 || lng > 180)) {
    const err = new Error("Invalid longitude value.");
    err.code = "INVALID_STOP_COORDINATES";
    err.statusCode = 400;
    return err;
  }
  return null;
}

module.exports = { validateCoordinates };

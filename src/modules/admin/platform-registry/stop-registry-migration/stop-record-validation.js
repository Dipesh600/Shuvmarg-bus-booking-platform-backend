"use strict";

const { scanError } = require("./migration-errors");

function validateStopRecord(stop) {
  const errors = [];

  if (!stop.name || stop.name.trim() === "") {
    errors.push(scanError(stop, "INVALID_STOP_NAME", "Stop name is required and cannot be blank."));
  }

  if (stop.coordinates) {
    const { lat, lng } = stop.coordinates;
    if ((lat === null && lng !== null) || (lat !== null && lng === null)) {
      errors.push(
        scanError(
          stop,
          "INVALID_STOP_COORDINATES",
          "Both latitude and longitude must be provided, or both must be null."
        )
      );
    } else if (lat !== null) {
      if (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
        errors.push(scanError(stop, "INVALID_STOP_COORDINATES", "Latitude must be between -90 and 90."));
      }
      if (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        errors.push(scanError(stop, "INVALID_STOP_COORDINATES", "Longitude must be between -180 and 180."));
      }
    }
  }

  return errors;
}

module.exports = { validateStopRecord };

"use strict";

const { ApiError, mapApiError, API_ERROR_CODES } = require("../../../contracts");

function mapFleetCommandError(error, logger = console) {
  if (error instanceof ApiError) {
    return mapApiError(error, logger);
  }

  if (error?.code && API_ERROR_CODES[error.code]) {
    return mapApiError(new ApiError(error.code), logger);
  }

  if (error?.name === "CastError") {
    return mapApiError(new ApiError("FLEET_INVALID_ID"), logger);
  }

  if (error?.name === "ValidationError") {
    return mapApiError(new ApiError("FLEET_VALIDATION_FAILED"), logger);
  }

  const msg = (error?.message || "").toLowerCase();

  if (msg.includes("exists")) {
    return mapApiError(new ApiError("FLEET_ALREADY_EXISTS"), logger);
  }

  if (msg.includes("not found") || msg.includes("unauthorized")) {
    return mapApiError(new ApiError("FLEET_NOT_FOUND"), logger);
  }

  return mapApiError(error, logger);
}

module.exports = { mapFleetCommandError };

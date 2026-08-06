"use strict";

const { ApiError, mapApiError, API_ERROR_CODES } = require("../../../contracts");

const OPERATION_FALLBACKS = {
  create: "FLEET_CREATE_FAILED",
  update: "FLEET_UPDATE_FAILED",
  delete: "FLEET_DELETE_FAILED",
};

function mapFleetCommandError(error, options = {}) {
  const logger = options.logger || console;
  const operation = options.operation || "create";

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

  const fallbackCode = OPERATION_FALLBACKS[operation] || "FLEET_CREATE_FAILED";
  return mapApiError(new ApiError(fallbackCode), logger);
}

module.exports = { mapFleetCommandError };

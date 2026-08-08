"use strict";

const { ReadContractError } = require("./read-errors");
const { mapApiError, ApiError } = require("../../../contracts");

function mapReadError(error, logger = console) {
  if (error && error.name === "CastError") {
    return mapApiError(new ApiError("READ_INVALID_ID"), logger);
  }
  if (error && error.name === "ValidationError") {
    return mapApiError(new ApiError("READ_INVALID_FILTER"), logger);
  }

  if (error instanceof ReadContractError) {
    return mapApiError(new ApiError(error.code), logger);
  }

  return mapApiError(error, logger);
}

module.exports = {
  mapReadError,
};

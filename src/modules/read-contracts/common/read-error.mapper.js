"use strict";

const { ReadContractError } = require("./read-errors");

function mapReadError(error, logger = console) {
  if (error instanceof ReadContractError) {
    return {
      statusCode: error.statusCode,
      payload: {
        success: false,
        code: error.code,
        message: error.message,
      },
    };
  }

  if (error && error.statusCode && typeof error.statusCode === "number") {
    return {
      statusCode: error.statusCode,
      payload: {
        success: false,
        message: error.message || "Request failed",
      },
    };
  }

  logger.error("Unhandled read contract error:", error);
  return {
    statusCode: 500,
    payload: {
      success: false,
      message: "Internal server error",
    },
  };
}

module.exports = {
  mapReadError,
};

"use strict";

const { ApiError } = require("./api-error");
const { API_ERROR_REGISTRY } = require("./registry");

function buildCanonicalPayload(code, message, details = null, retryable = false) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      retryable,
    },
  };
}

function mapApiError(error, logger = console) {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      payload: buildCanonicalPayload(
        error.code,
        error.message,
        error.details,
        error.retryable
      ),
    };
  }

  // Handle ReadContractError instances or known domain error shapes
  if (error && typeof error.code === "string" && API_ERROR_REGISTRY[error.code]) {
    const reg = API_ERROR_REGISTRY[error.code];
    return {
      statusCode: reg.statusCode,
      payload: buildCanonicalPayload(
        error.code,
        reg.message,
        error.details || null,
        reg.retryable
      ),
    };
  }

  // Unexpected errors or unrecognized objects with numeric statusCode
  logger.error("Unhandled API error:", error);

  const fallback = API_ERROR_REGISTRY.INTERNAL_SERVER_ERROR;
  return {
    statusCode: fallback.statusCode,
    payload: buildCanonicalPayload(
      "INTERNAL_SERVER_ERROR",
      fallback.message,
      null,
      fallback.retryable
    ),
  };
}

module.exports = {
  mapApiError,
  buildCanonicalPayload,
};

const { ApiError, sanitizeErrorDetails } = require("./api-error");
const { API_ERROR_REGISTRY } = require("./registry");
const { ReadContractError } = require("../../modules/read-contracts/common/read-errors");

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

  // Explicit class adapter for ReadContractError — instanceof only, no name-based trust
  if (error instanceof ReadContractError) {
    const code = API_ERROR_REGISTRY[error.code] ? error.code : "INTERNAL_SERVER_ERROR";
    const reg = API_ERROR_REGISTRY[code];
    const details = sanitizeErrorDetails(code, error.details);
    return {
      statusCode: reg.statusCode,
      payload: buildCanonicalPayload(
        code,
        reg.message,
        details,
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

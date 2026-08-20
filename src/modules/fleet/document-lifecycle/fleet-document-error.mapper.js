"use strict";

function mapErrorToResponse(error, res, logger = console) {
  const code = error.errorCode || error.code;
  if (error && error.statusCode && code) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: code,
    });
  }

  if (error && (error.name === "ValidationError" || error.name === "CastError")) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: "VALIDATION_ERROR",
    });
  }

  logger.error("[FleetDocumentError]", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error: " + (error ? error.message : "unknown"),
  });
}

module.exports = {
  mapErrorToResponse,
};

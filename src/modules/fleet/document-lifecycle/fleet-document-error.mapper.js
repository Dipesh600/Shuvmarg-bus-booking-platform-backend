"use strict";

function mapErrorToResponse(error, res, logger = console) {
  if (error && error.statusCode && error.code) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }

  logger.error("[FleetDocumentError]", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

module.exports = {
  mapErrorToResponse,
};

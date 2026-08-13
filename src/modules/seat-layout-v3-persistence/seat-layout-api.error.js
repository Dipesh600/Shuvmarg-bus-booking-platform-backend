"use strict";

function sendSeatLayoutError(res, error, logger = console) {
  if (error?.code === 11000) {
    return res.status(409).json({
      success: false, errorCode: "SEAT_LAYOUT_IDENTITY_CONFLICT",
      message: "A seat-layout record with this identity already exists.",
    });
  }
  if (error?.name === "CastError") {
    return res.status(400).json({
      success: false, errorCode: "SEAT_LAYOUT_ID_INVALID", message: "A supplied identifier is invalid.",
    });
  }
  if (error?.name === "ValidationError") {
    return res.status(422).json({
      success: false, errorCode: "SEAT_LAYOUT_INPUT_INVALID",
      message: "The seat-layout request contains invalid or missing fields.",
    });
  }
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({
      success: false, errorCode: error.code || "SEAT_LAYOUT_OPERATION_FAILED",
      message: error.message, ...(error.details ? { details: error.details } : {}),
    });
  }
  logger.error("seat-layout-v3", { code: error?.code, message: error?.message });
  return res.status(500).json({
    success: false, errorCode: "SEAT_LAYOUT_INTERNAL_ERROR",
    message: "The seat-layout operation could not be completed.",
  });
}

module.exports = { sendSeatLayoutError };

"use strict";

function operatorRouteConfigError(code, message, statusCode = 500, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function toPublicError(error) {
  const isDuplicateRouteConfig =
    error?.code === 11000 &&
    (
      error?.keyPattern?.brandId ||
      error?.keyPattern?.variantId ||
      error?.keyPattern?.patternName ||
      error?.keyValue?.brandId ||
      error?.keyValue?.variantId ||
      error?.keyValue?.patternName
    );
  if (!isDuplicateRouteConfig) return error;
  return {
    statusCode: 409,
    code: "ROUTE_CONFIG_INDEX_REPAIR_REQUIRED",
    message: "Route setup needs a one-time repair before this bus can save stops and timings. Ask admin to refresh route setup storage, then try again.",
  };
}

function sendError(res, error, logger) {
  const publicError = toPublicError(error);
  logger.error("bus-owner-operator-route-configuration", {
    code: error.code,
    message: error.message,
  });
  return res.status(publicError.statusCode || 500).json({
    success: false,
    errorCode: publicError.code || "OPERATOR_ROUTE_CONFIG_FAILED",
    message: publicError.statusCode ? publicError.message : "Unable to complete route configuration.",
    ...(publicError.details === undefined ? {} : { details: publicError.details }),
  });
}

module.exports = { operatorRouteConfigError, sendError, toPublicError };

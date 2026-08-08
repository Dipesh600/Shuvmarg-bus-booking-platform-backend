"use strict";

const { FleetApprovalError } = require("./fleet-approval.errors");

function mapFleetApprovalError(error) {
  if (!error) {
    return {
      statusCode: 500,
      payload: { success: false, message: "Internal server error" },
    };
  }

  if (error instanceof FleetApprovalError) {
    const payload = {
      success: false,
      message: error.message,
      errorCode: error.code,
    };
    if (error.field) payload.field = error.field;
    return { statusCode: error.statusCode, payload };
  }

  const statusCode = error.statusCode || error.status || 500;
  if (statusCode >= 400 && statusCode < 500) {
    const payload = {
      success: false,
      message: error.message || "Bad Request",
    };
    if (error.code) payload.errorCode = error.code;
    if (error.field) payload.field = error.field;
    return { statusCode, payload };
  }

  return {
    statusCode: 500,
    payload: { success: false, message: "Internal server error" },
  };
}

module.exports = { mapFleetApprovalError };

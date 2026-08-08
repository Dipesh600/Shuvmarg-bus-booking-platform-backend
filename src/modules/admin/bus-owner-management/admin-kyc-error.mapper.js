"use strict";

function mapAdminKycError(error) {
  if (!error) {
    return {
      statusCode: 500,
      payload: { success: false, message: "Internal Server Error" },
    };
  }

  const statusCode = error.statusCode || error.status || 500;

  if (statusCode >= 400 && statusCode < 500) {
    const payload = {
      success: false,
      message: error.message || "Bad Request",
    };
    if (error.code && !error.code.startsWith("KYC_REUPLOAD_") && !error.code.startsWith("ADMIN_CREATION_")) {
      payload.errorCode = error.code;
    }
    if (error.field && !error.code.startsWith("ADMIN_CREATION_")) payload.field = error.field;
    return { statusCode, payload };
  }

  return {
    statusCode: 500,
    payload: { success: false, message: "Internal Server Error" },
  };
}

module.exports = { mapAdminKycError };

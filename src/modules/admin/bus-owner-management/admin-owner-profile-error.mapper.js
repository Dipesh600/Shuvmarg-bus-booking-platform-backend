"use strict";

const { AdminOwnerProfileError } = require("./admin-owner-profile.errors");

function mapAdminOwnerProfileError(error) {
  if (!error) {
    return {
      statusCode: 500,
      payload: { success: false, message: "Internal server error" },
    };
  }

  if (error instanceof AdminOwnerProfileError) {
    const payload = {
      success: false,
      message: error.message,
      errorCode: error.code,
    };
    if (error.fields) payload.fields = error.fields;
    if (error.field) payload.field = error.field;
    return { statusCode: error.statusCode, payload };
  }

  if (error.code === 11000) {
    if (error.keyPattern?.email || error.keyValue?.email) {
      return {
        statusCode: 409,
        payload: {
          success: false,
          message: "Email address is already in use by another user.",
          errorCode: "OWNER_PROFILE_EMAIL_CONFLICT",
          field: "email",
        },
      };
    }
    if (error.keyPattern?.phone || error.keyValue?.phone) {
      return {
        statusCode: 409,
        payload: {
          success: false,
          message: "Phone number is already in use by another user.",
          errorCode: "OWNER_PROFILE_PHONE_CONFLICT",
          field: "phone",
        },
      };
    }
    return {
      statusCode: 409,
      payload: {
        success: false,
        message: "A unique constraint conflict occurred.",
        errorCode: "OWNER_PROFILE_UNIQUE_CONFLICT",
      },
    };
  }

  const statusCode = error.statusCode || error.status || 500;
  if (statusCode >= 400 && statusCode < 500) {
    const payload = {
      success: false,
      message: error.message || "Bad Request",
    };
    if (error.code) payload.errorCode = error.code;
    if (error.fields) payload.fields = error.fields;
    if (error.field) payload.field = error.field;
    return { statusCode, payload };
  }

  return {
    statusCode: 500,
    payload: { success: false, message: "Internal server error" },
  };
}

module.exports = { mapAdminOwnerProfileError };

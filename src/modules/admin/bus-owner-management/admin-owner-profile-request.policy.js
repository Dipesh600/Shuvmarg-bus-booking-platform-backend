"use strict";

const mongoose = require("mongoose");
const {
  ALLOWED_PROFILE_FIELDS,
  PRIVILEGED_FIELDS,
  PROFILE_FIELD_LIMITS,
} = require("./admin-owner-profile.constants");
const { AdminOwnerProfileError } = require("./admin-owner-profile.errors");

function validateAdminOwnerProfileRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminOwnerProfileError(
      "OWNER_PROFILE_INVALID_BODY",
      "Request body must be an object.",
      400
    );
  }

  for (const key of Object.keys(body)) {
    if (PRIVILEGED_FIELDS.includes(key)) {
      throw new AdminOwnerProfileError(
        "OWNER_PROFILE_PRIVILEGED_FIELD",
        `Privileged field '${key}' is forbidden.`,
        400,
        { field: key }
      );
    }
    if (!ALLOWED_PROFILE_FIELDS.includes(key)) {
      throw new AdminOwnerProfileError(
        "OWNER_PROFILE_UNKNOWN_FIELD",
        `Unexpected field '${key}' in request body.`,
        400,
        { field: key }
      );
    }
  }

  const { id, changeReason } = body;

  if (!id) {
    throw new AdminOwnerProfileError(
      "OWNER_PROFILE_ID_REQUIRED",
      "Bus Owner ID is required.",
      400,
      { field: "id" }
    );
  }

  if (typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
    throw new AdminOwnerProfileError(
      "OWNER_PROFILE_INVALID_ID",
      "Bus Owner ID must be a valid Mongo ObjectId string.",
      400,
      { field: "id" }
    );
  }

  if (changeReason === undefined || changeReason === null || typeof changeReason !== "string") {
    throw new AdminOwnerProfileError(
      "OWNER_PROFILE_INVALID_REASON",
      "changeReason is required for profile update.",
      400,
      { field: "changeReason" }
    );
  }

  const trimmedReason = changeReason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new AdminOwnerProfileError(
      "OWNER_PROFILE_INVALID_REASON",
      "changeReason must be between 5 and 500 characters.",
      400,
      { field: "changeReason" }
    );
  }

  const updates = {};
  const profileKeys = ALLOWED_PROFILE_FIELDS.filter(
    (k) => k !== "id" && k !== "changeReason"
  );

  for (const key of profileKeys) {
    if (body[key] !== undefined) {
      const val = body[key];
      if (val === null || typeof val !== "string") {
        throw new AdminOwnerProfileError(
          "OWNER_PROFILE_INVALID_VALUE",
          `Field '${key}' must be a non-empty string.`,
          400,
          { field: key }
        );
      }
      const trimmed = val.trim();
      if (trimmed.length === 0) {
        throw new AdminOwnerProfileError(
          "OWNER_PROFILE_INVALID_VALUE",
          `Field '${key}' cannot be blank.`,
          400,
          { field: key }
        );
      }

      const limit = PROFILE_FIELD_LIMITS[key];
      if (limit && trimmed.length > limit) {
        throw new AdminOwnerProfileError(
          "OWNER_PROFILE_VALUE_TOO_LONG",
          `Field '${key}' exceeds maximum length of ${limit} characters.`,
          400,
          { field: key }
        );
      }

      updates[key] = key === "email" ? trimmed.toLowerCase() : trimmed;
    }
  }

  return {
    id,
    changeReason: trimmedReason,
    updates,
  };
}

module.exports = { validateAdminOwnerProfileRequest };

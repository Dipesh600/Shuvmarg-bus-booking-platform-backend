"use strict";

const { getApiErrorDefinition } = require("./registry");

const ERROR_DETAIL_FIELDS = Object.freeze({
  READ_INVALID_FILTER: Object.freeze(["field", "allowedValues", "reason"]),
  READ_INVALID_PAGE: Object.freeze(["field", "min"]),
  READ_INVALID_LIMIT: Object.freeze(["field", "max", "min"]),
  READ_INVALID_ID: Object.freeze(["field"]),
  READ_INVALID_SEARCH: Object.freeze(["field", "maxLength"]),
  MISSING_REQUIRED_FIELD: Object.freeze(["fields", "field"]),
  INVALID_ID: Object.freeze(["field"]),
  INVALID_STATUS: Object.freeze(["field", "allowedValues"]),
  DOCUMENT_SLOT_INVALID: Object.freeze(["slot", "allowedSlots"]),
});

function sanitizeErrorDetails(code, details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const allowedKeys = ERROR_DETAIL_FIELDS[code];
  if (!allowedKeys || !Array.isArray(allowedKeys)) {
    return null;
  }
  const clean = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(details, key)) {
      const val = details[key];
      if (
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean" ||
        val === null
      ) {
        clean[key] = val;
      } else if (Array.isArray(val)) {
        clean[key] = val.filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
        );
      }
    }
  }
  return Object.keys(clean).length > 0 ? Object.freeze(clean) : null;
}

class ApiError extends Error {
  constructor(code, options = {}) {
    const definition = getApiErrorDefinition(code);

    super(definition.message);

    this.name = "ApiError";
    this.code = code;
    this.statusCode = definition.statusCode;
    this.retryable = definition.retryable;
    this.details = sanitizeErrorDetails(code, options.details);
    this.cause = options.cause;

    Object.freeze(this);
  }
}

module.exports = {
  ApiError,
  sanitizeErrorDetails,
};

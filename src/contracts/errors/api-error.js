"use strict";

const { getApiErrorDefinition } = require("./registry");

function sanitizeErrorDetails(code, details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const clean = {};
  for (const [key, val] of Object.entries(details)) {
    if (
      ["stack", "cause", "password", "token", "query", "internal"].includes(
        key.toLowerCase()
      )
    ) {
      continue;
    }
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

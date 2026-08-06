"use strict";

const FLEET_ERRORS = Object.freeze({
  FLEET_INVALID_ID: Object.freeze({
    statusCode: 400,
    message: "Fleet ID is invalid.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Fleet record not found.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_ALREADY_EXISTS: Object.freeze({
    statusCode: 409,
    message: "Fleet record with these details already exists.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_VALIDATION_FAILED: Object.freeze({
    statusCode: 400,
    message: "Fleet validation failed.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_CREATE_FAILED: Object.freeze({
    statusCode: 500,
    message: "Failed to create fleet record.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_UPDATE_FAILED: Object.freeze({
    statusCode: 500,
    message: "Failed to update fleet record.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_DELETE_FAILED: Object.freeze({
    statusCode: 500,
    message: "Failed to delete fleet record.",
    domain: "fleet",
    retryable: false,
  }),
});

module.exports = { FLEET_ERRORS };

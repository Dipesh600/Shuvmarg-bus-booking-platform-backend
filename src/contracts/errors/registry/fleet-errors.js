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
    message: "A bus with this number already exists.",
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
  FLEET_MUTATION_LOCKED: Object.freeze({
    statusCode: 409,
    message: "Fleet is locked and cannot be edited or deleted.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_LIFECYCLE_UPDATE_FORBIDDEN: Object.freeze({
    statusCode: 409,
    message: "Fleet approval decisions must use the dedicated fleet status endpoint.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_SUBMISSION_LOCKED: Object.freeze({
    statusCode: 409,
    message: "This bus is already in review or approved.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_SUBMISSION_INCOMPLETE: Object.freeze({
    statusCode: 422,
    message: "Fleet setup or compliance documents are incomplete.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_CORRECTIONS_INCOMPLETE: Object.freeze({
    statusCode: 422,
    message: "Complete every requested fleet correction before resubmitting.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_SECTION_NOT_REJECTED: Object.freeze({
    statusCode: 409,
    message: "This fleet section was accepted and cannot be changed in this correction round.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_BRAND_REQUIRED: Object.freeze({
    statusCode: 400,
    message: "Operator brand is required.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_BRAND_INVALID: Object.freeze({
    statusCode: 400,
    message: "Operator brand ID is invalid.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_BRAND_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Operator brand not found.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_BRAND_INACTIVE: Object.freeze({
    statusCode: 409,
    message: "Operator brand is not active.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_BRAND_FORBIDDEN: Object.freeze({
    statusCode: 403,
    message: "Operator brand does not belong to this owner.",
    domain: "fleet",
    retryable: false,
  }),
});

module.exports = { FLEET_ERRORS };

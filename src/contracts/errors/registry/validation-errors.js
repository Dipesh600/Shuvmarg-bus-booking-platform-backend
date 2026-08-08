"use strict";

const VALIDATION_ERRORS = Object.freeze({
  READ_INVALID_ID: Object.freeze({
    statusCode: 400,
    message: "Resource identifier format is invalid.",
    domain: "validation",
    retryable: false,
  }),
  READ_INVALID_PAGE: Object.freeze({
    statusCode: 400,
    message: "Page query parameter must be a positive integer.",
    domain: "validation",
    retryable: false,
  }),
  READ_INVALID_LIMIT: Object.freeze({
    statusCode: 400,
    message: "Limit query parameter must be a positive integer within bounds.",
    domain: "validation",
    retryable: false,
  }),
  READ_INVALID_FILTER: Object.freeze({
    statusCode: 400,
    message: "Query filter parameters are invalid.",
    domain: "validation",
    retryable: false,
  }),
  READ_INVALID_SEARCH: Object.freeze({
    statusCode: 400,
    message: "Search query parameter is invalid or exceeds max length.",
    domain: "validation",
    retryable: false,
  }),
  INVALID_ID: Object.freeze({
    statusCode: 400,
    message: "Resource identifier is invalid.",
    domain: "validation",
    retryable: false,
  }),
  INVALID_STATUS: Object.freeze({
    statusCode: 400,
    message: "Provided status value is invalid.",
    domain: "validation",
    retryable: false,
  }),
  MISSING_REQUIRED_FIELD: Object.freeze({
    statusCode: 400,
    message: "Required request fields are missing.",
    domain: "validation",
    retryable: false,
  }),
});

module.exports = { VALIDATION_ERRORS };

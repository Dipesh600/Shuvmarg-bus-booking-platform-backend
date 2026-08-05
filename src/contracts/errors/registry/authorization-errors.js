"use strict";

const AUTHORIZATION_ERRORS = Object.freeze({
  ADMIN_ACCESS_REQUIRED: Object.freeze({
    statusCode: 403,
    message: "Admin privilege is required for this operation.",
    domain: "authorization",
    retryable: false,
  }),
  BUS_OWNER_ACCESS_REQUIRED: Object.freeze({
    statusCode: 403,
    message: "Bus owner privilege is required for this operation.",
    domain: "authorization",
    retryable: false,
  }),
  READ_FORBIDDEN: Object.freeze({
    statusCode: 403,
    message: "You are not authorized to view this resource.",
    domain: "authorization",
    retryable: false,
  }),
  RESOURCE_OWNERSHIP_REQUIRED: Object.freeze({
    statusCode: 403,
    message: "You do not own this resource.",
    domain: "authorization",
    retryable: false,
  }),
});

module.exports = { AUTHORIZATION_ERRORS };

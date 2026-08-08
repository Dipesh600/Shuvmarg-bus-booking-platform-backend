"use strict";

const AUTHENTICATION_ERRORS = Object.freeze({
  AUTHENTICATION_REQUIRED: Object.freeze({
    statusCode: 401,
    message: "Authentication is required to access this resource.",
    domain: "authentication",
    retryable: false,
  }),
  INVALID_ACCESS_TOKEN: Object.freeze({
    statusCode: 401,
    message: "Access token is invalid or corrupted.",
    domain: "authentication",
    retryable: false,
  }),
  ACCESS_TOKEN_EXPIRED: Object.freeze({
    statusCode: 401,
    message: "Access token has expired.",
    domain: "authentication",
    retryable: false,
  }),
  UNAUTHORIZED_ADMIN: Object.freeze({
    statusCode: 401,
    message: "Admin authentication required.",
    domain: "authentication",
    retryable: false,
  }),
  UNAUTHORIZED_OWNER: Object.freeze({
    statusCode: 401,
    message: "Bus owner authentication required.",
    domain: "authentication",
    retryable: false,
  }),
  ACCOUNT_INACTIVE: Object.freeze({
    statusCode: 403,
    message: "Account is inactive.",
    domain: "authentication",
    retryable: false,
  }),
  ACCOUNT_LOCKED: Object.freeze({
    statusCode: 403,
    message: "Account has been locked or suspended.",
    domain: "authentication",
    retryable: false,
  }),
  ROLE_MISMATCH: Object.freeze({
    statusCode: 403,
    message: "Account role does not match required permissions.",
    domain: "authentication",
    retryable: false,
  }),
});

module.exports = { AUTHENTICATION_ERRORS };

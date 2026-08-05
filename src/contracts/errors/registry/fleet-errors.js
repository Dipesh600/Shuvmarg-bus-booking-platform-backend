"use strict";

const FLEET_ERRORS = Object.freeze({
  FLEET_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Fleet record not found.",
    domain: "fleet",
    retryable: false,
  }),
  FLEET_NOT_OWNED: Object.freeze({
    statusCode: 403,
    message: "Fleet is not owned by authenticated bus owner.",
    domain: "fleet",
    retryable: false,
  }),
});

module.exports = { FLEET_ERRORS };

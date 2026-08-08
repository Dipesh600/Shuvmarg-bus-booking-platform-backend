"use strict";

const GENERAL_ERRORS = Object.freeze({
  INTERNAL_SERVER_ERROR: Object.freeze({
    statusCode: 500,
    message: "Internal server error.",
    domain: "general",
    retryable: true,
  }),
});

module.exports = { GENERAL_ERRORS };

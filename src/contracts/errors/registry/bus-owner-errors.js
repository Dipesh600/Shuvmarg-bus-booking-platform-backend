"use strict";

const BUS_OWNER_ERRORS = Object.freeze({
  BUS_OWNER_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Bus owner record not found.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_PROFILE_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Bus owner profile not found.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_KYC_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Bus owner KYC record not found.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_ONBOARDING_VALIDATION_FAILED: Object.freeze({
    statusCode: 400,
    message: "Onboarding body validation failed.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_ONBOARDING_UNKNOWN_FIELD: Object.freeze({
    statusCode: 400,
    message: "Onboarding request contains an unknown field.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_ONBOARDING_USER_NOT_FOUND: Object.freeze({
    statusCode: 404,
    message: "Authenticated user account was not found.",
    domain: "bus-owner",
    retryable: false,
  }),
  BUS_OWNER_ONBOARDING_TRANSACTION_UNAVAILABLE: Object.freeze({
    statusCode: 500,
    message: "Onboarding persistence is temporarily unavailable.",
    domain: "bus-owner",
    retryable: false,
  }),
  PROFILE_NOT_APPROVED: Object.freeze({
    statusCode: 403,
    message: "Business verification is required before performing this action.",
    domain: "bus-owner",
    retryable: false,
  }),
});

module.exports = { BUS_OWNER_ERRORS };

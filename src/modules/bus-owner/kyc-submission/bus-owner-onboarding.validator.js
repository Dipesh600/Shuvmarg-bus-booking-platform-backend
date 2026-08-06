"use strict";

const { BusOwnerOnboardingValidationError } = require("./kyc-submission.errors");

const REQUIRED_FIELDS = Object.freeze([
  "companyName",
  "ownerName",
  "address",
  "panNumber",
  "registrationNumber",
  "bankName",
  "accountHolderName",
  "accountNumber",
  "branchName",
]);

const OPTIONAL_FIELDS = Object.freeze(["swiftCode"]);

const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

const MAX_LENGTHS = Object.freeze({
  companyName: 200,
  ownerName: 200,
  address: 500,
  panNumber: 20,
  registrationNumber: 100,
  bankName: 200,
  accountHolderName: 200,
  accountNumber: 50,
  branchName: 200,
  swiftCode: 20,
});

const FORBIDDEN_BODY_FIELDS = Object.freeze([
  "userId",
  "ownerId",
  "busOwnerId",
  "verificationStatus",
  "verified",
  "approved",
  "rejectionReason",
  "kycReview",
  "kycAuditHistory",
]);

function validateOnboardingBody(rawBody) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw new BusOwnerOnboardingValidationError(
      "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
      "Onboarding body is missing or malformed."
    );
  }

  for (const field of FORBIDDEN_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawBody, field)) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD",
        `Field '${field}' is not permitted in onboarding submissions.`,
        field
      );
    }
  }

  for (const field of Object.keys(rawBody)) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD",
        `Unknown field '${field}' in onboarding request.`,
        field
      );
    }
  }

  const normalized = {};

  for (const field of REQUIRED_FIELDS) {
    const raw = rawBody[field];
    if (raw === undefined || raw === null) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        `Required field '${field}' is missing.`,
        field
      );
    }
    if (typeof raw !== "string") {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        `Field '${field}' must be a string.`,
        field
      );
    }
    const trimmed = raw.trim();
    if (trimmed === "") {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        `Required field '${field}' must not be empty or whitespace-only.`,
        field
      );
    }
    const max = MAX_LENGTHS[field];
    if (trimmed.length > max) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        `Field '${field}' exceeds maximum length of ${max} characters.`,
        field
      );
    }
    normalized[field] = trimmed;
  }

  if (rawBody.swiftCode !== undefined && rawBody.swiftCode !== null) {
    if (typeof rawBody.swiftCode !== "string") {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        "Field 'swiftCode' must be a string.",
        "swiftCode"
      );
    }
    const trimmed = rawBody.swiftCode.trim();
    if (trimmed.length > MAX_LENGTHS.swiftCode) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_VALIDATION_FAILED",
        `Field 'swiftCode' exceeds maximum length of ${MAX_LENGTHS.swiftCode} characters.`,
        "swiftCode"
      );
    }
    normalized.swiftCode = trimmed || null;
  } else {
    normalized.swiftCode = null;
  }

  return normalized;
}

module.exports = { validateOnboardingBody, ALLOWED_FIELDS, REQUIRED_FIELDS };

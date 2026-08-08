"use strict";

const { BusOwnerOnboardingValidationError } = require("./kyc-submission.errors");
const {
  NEPAL_SETTLEMENT_INSTITUTION_NAMES,
  normalizeNepalSettlementInstitutionName,
} = require("./nepal-settlement-institutions");
const fields = require("./bus-owner-onboarding.fields");
const {
  createTextNormalizer, normalizeAddress, normalizeSwiftCode, invalid,
} = require("./bus-owner-onboarding.normalizers");

function validateShape(rawBody) {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw invalid("Onboarding body is missing or malformed.");
  }
  for (const field of fields.FORBIDDEN_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawBody, field)) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD",
        `Field '${field}' is not permitted in onboarding submissions.`, field
      );
    }
  }
  for (const field of Object.keys(rawBody)) {
    if (!fields.ALLOWED_FIELDS.has(field)) {
      throw new BusOwnerOnboardingValidationError(
        "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD", `Unknown field '${field}' in onboarding request.`, field
      );
    }
  }
}

function validateOnboardingBody(rawBody) {
  validateShape(rawBody);
  const normalizeTextField = createTextNormalizer(rawBody);
  const normalized = {};
  for (const field of fields.REQUIRED_FIELDS) normalized[field] = normalizeTextField(field);

  normalized.bankName = normalizeNepalSettlementInstitutionName(normalized.bankName);
  if (!NEPAL_SETTLEMENT_INSTITUTION_NAMES.has(normalized.bankName)) {
    throw invalid("Select a bank or financial institution licensed by Nepal Rastra Bank.", "bankName");
  }
  Object.assign(normalized, normalizeAddress(rawBody, normalizeTextField));
  if (!fields.NEPAL_PAN_PATTERN.test(normalized.panNumber)) {
    throw invalid("PAN number must contain exactly 9 digits.", "panNumber");
  }
  if (!fields.ACCOUNT_NUMBER_PATTERN.test(normalized.accountNumber)) {
    throw invalid("Account number contains unsupported characters.", "accountNumber");
  }
  normalized.swiftCode = normalizeSwiftCode(rawBody);
  return normalized;
}

module.exports = { validateOnboardingBody, ...fields };

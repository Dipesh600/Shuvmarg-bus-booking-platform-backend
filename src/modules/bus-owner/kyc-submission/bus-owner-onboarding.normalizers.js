"use strict";

const { BusOwnerOnboardingValidationError } = require("./kyc-submission.errors");
const {
  MAX_LENGTHS, MIN_LENGTHS, STRUCTURED_ADDRESS_REQUIRED_FIELDS,
  NEPAL_POSTAL_CODE_PATTERN, WARD_NUMBER_PATTERN, NEPAL_PROVINCES, SWIFT_BIC_PATTERN,
} = require("./bus-owner-onboarding.fields");

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const invalid = (message, field) => new BusOwnerOnboardingValidationError(
  "BUS_OWNER_ONBOARDING_VALIDATION_FAILED", message, field
);

function createTextNormalizer(rawBody) {
  return (field, required = true) => {
    const raw = rawBody[field];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
      if (!required) return null;
      throw invalid(`Required field '${field}' is missing or empty.`, field);
    }
    if (typeof raw !== "string") throw invalid(`Field '${field}' must be a string.`, field);
    const trimmed = raw.trim();
    const max = MAX_LENGTHS[field];
    const min = MIN_LENGTHS[field];
    if (max && trimmed.length > max) {
      throw invalid(`Field '${field}' exceeds maximum length of ${max} characters.`, field);
    }
    if (min && trimmed.length < min) {
      throw invalid(`Field '${field}' must contain at least ${min} characters.`, field);
    }
    if (CONTROL_CHARACTER_PATTERN.test(trimmed)) {
      throw invalid(`Field '${field}' contains unsupported control characters.`, field);
    }
    return trimmed;
  };
}

function normalizeAddress(rawBody, normalizeTextField) {
  const structured = STRUCTURED_ADDRESS_REQUIRED_FIELDS.some(
    (field) => Object.prototype.hasOwnProperty.call(rawBody, field)
  );
  if (!structured) {
    const value = normalizeTextField(rawBody.registeredAddressLine1 ? "registeredAddressLine1" : "address");
    return { address: value, registeredAddress: {
      tole: value, wardNumber: null, municipality: null, district: null,
      province: null, postalCode: null, country: "Nepal",
    } };
  }
  const fields = Object.fromEntries(
    STRUCTURED_ADDRESS_REQUIRED_FIELDS.map((field) => [field, normalizeTextField(field)])
  );
  fields.registeredPostalCode = normalizeTextField("registeredPostalCode", false);
  if (!NEPAL_PROVINCES.has(fields.registeredProvince)) {
    throw invalid("Select a valid Nepal province.", "registeredProvince");
  }
  if (fields.registeredCountry !== "Nepal") {
    throw invalid("Registered country must be Nepal.", "registeredCountry");
  }
  if (fields.registeredPostalCode && !NEPAL_POSTAL_CODE_PATTERN.test(fields.registeredPostalCode)) {
    throw invalid("Postal code must contain exactly 5 digits.", "registeredPostalCode");
  }
  if (!WARD_NUMBER_PATTERN.test(fields.registeredWardNumber)) {
    throw invalid("Ward number must be between 1 and 99.", "registeredWardNumber");
  }
  return { address: fields.registeredTole, registeredAddress: {
    tole: fields.registeredTole, wardNumber: fields.registeredWardNumber,
    municipality: fields.registeredMunicipality, district: fields.registeredDistrict,
    province: fields.registeredProvince, postalCode: fields.registeredPostalCode,
    country: fields.registeredCountry,
  } };
}

function normalizeSwiftCode(rawBody) {
  if (rawBody.swiftCode === undefined || rawBody.swiftCode === null) return null;
  if (typeof rawBody.swiftCode !== "string") throw invalid("Field 'swiftCode' must be a string.", "swiftCode");
  const value = rawBody.swiftCode.trim().toUpperCase();
  if (value.length > MAX_LENGTHS.swiftCode) {
    throw invalid(`Field 'swiftCode' exceeds maximum length of ${MAX_LENGTHS.swiftCode} characters.`, "swiftCode");
  }
  if (value && !SWIFT_BIC_PATTERN.test(value)) {
    throw invalid("SWIFT/BIC must contain 8 or 11 valid characters.", "swiftCode");
  }
  return value || null;
}

module.exports = { createTextNormalizer, normalizeAddress, normalizeSwiftCode, invalid };

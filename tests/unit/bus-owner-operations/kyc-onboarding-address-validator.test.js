"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateOnboardingBody } = require("../../../src/modules/bus-owner/kyc-submission/bus-owner-onboarding.validator");
const { BusOwnerOnboardingValidationError } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.errors");

const VALID_BODY = {
  companyName: "Nepal Transport Co.", ownerName: "Raju Shrestha",
  panNumber: "123456789", registrationNumber: "REG-001", bankName: "Nepal Bank",
  accountHolderName: "Raju Shrestha", accountNumber: "12345678901234", branchName: "Newroad Branch",
};
const address = (overrides = {}) => ({
  registeredTole: "New Road", registeredWardNumber: "4",
  registeredMunicipality: "Kathmandu Metropolitan City", registeredDistrict: "Kathmandu",
  registeredProvince: "Bagmati", registeredPostalCode: "44600",
  registeredCountry: "Nepal", ...overrides,
});

test("rejects an institution outside the NRB settlement list", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, ...address(), bankName: "Made Up Bank" }),
    (error) => error instanceof BusOwnerOnboardingValidationError && error.field === "bankName"
  );
});

test("accepts and normalizes a structured Nepal registered address", () => {
  const result = validateOnboardingBody({ ...VALID_BODY, ...address({ registeredTole: "  New Road  " }) });
  assert.deepEqual(result.registeredAddress, {
    tole: "New Road", wardNumber: "4", municipality: "Kathmandu Metropolitan City",
    district: "Kathmandu", province: "Bagmati", postalCode: "44600", country: "Nepal",
  });
});

test("rejects an invalid structured province", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, ...address({ registeredProvince: "Invalid Province" }) }),
    (error) => error instanceof BusOwnerOnboardingValidationError && error.field === "registeredProvince"
  );
});

test("rejects an invalid ward number", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, ...address({ registeredWardNumber: "0" }) }),
    (error) => error instanceof BusOwnerOnboardingValidationError && error.field === "registeredWardNumber"
  );
});

test("null or malformed body throws a typed error", () => {
  for (const bad of [null, undefined, "string", 42]) {
    assert.throws(
      () => validateOnboardingBody(bad),
      (error) => error instanceof BusOwnerOnboardingValidationError &&
        error.code === "BUS_OWNER_ONBOARDING_VALIDATION_FAILED"
    );
  }
});

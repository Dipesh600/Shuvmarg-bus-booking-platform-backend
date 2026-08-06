"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateOnboardingBody } = require(
  "../../../src/modules/bus-owner/kyc-submission/bus-owner-onboarding.validator"
);
const { BusOwnerOnboardingValidationError } = require(
  "../../../src/modules/bus-owner/kyc-submission/kyc-submission.errors"
);

const VALID_BODY = {
  companyName: "Nepal Transport Co.",
  ownerName: "Raju Shrestha",
  address: "Kathmandu, Nepal",
  panNumber: "123456789",
  registrationNumber: "REG-001",
  bankName: "Nepal Bank",
  accountHolderName: "Raju Shrestha",
  accountNumber: "12345678901234",
  branchName: "Newroad Branch",
};

test("validateOnboardingBody: valid body returns normalized object", () => {
  const result = validateOnboardingBody({
    ...VALID_BODY,
    swiftCode: "NBLNNPKA",
  });
  assert.equal(result.companyName, "Nepal Transport Co.");
  assert.equal(result.swiftCode, "NBLNNPKA");
});

test("validateOnboardingBody: optional swiftCode may be omitted", () => {
  const result = validateOnboardingBody(VALID_BODY);
  assert.equal(result.swiftCode, null);
});

test("validateOnboardingBody: whitespace is trimmed from all fields", () => {
  const result = validateOnboardingBody({
    ...VALID_BODY,
    companyName: "  Nepal Transport Co.  ",
    address: "  Kathmandu  ",
    swiftCode: "  NBLNNPKA  ",
  });
  assert.equal(result.companyName, "Nepal Transport Co.");
  assert.equal(result.address, "Kathmandu");
  assert.equal(result.swiftCode, "NBLNNPKA");
});

test("validateOnboardingBody: missing required field throws typed error", () => {
  const { ownerName: _, ...body } = VALID_BODY;
  assert.throws(
    () => validateOnboardingBody(body),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.code === "BUS_OWNER_ONBOARDING_VALIDATION_FAILED" &&
      err.field === "ownerName" &&
      err.statusCode === 400
  );
});

test("validateOnboardingBody: whitespace-only required field throws typed error", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, panNumber: "   " }),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.code === "BUS_OWNER_ONBOARDING_VALIDATION_FAILED" &&
      err.field === "panNumber"
  );
});

test("validateOnboardingBody: unknown field is rejected", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, extraField: "bad" }),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.code === "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD" &&
      err.field === "extraField"
  );
});

test("validateOnboardingBody: forbidden identity fields are rejected", () => {
  for (const field of ["userId", "ownerId", "verificationStatus", "kycAuditHistory"]) {
    assert.throws(
      () => validateOnboardingBody({ ...VALID_BODY, [field]: "evil" }),
      (err) =>
        err instanceof BusOwnerOnboardingValidationError &&
        err.code === "BUS_OWNER_ONBOARDING_UNKNOWN_FIELD" &&
        err.field === field,
      `Expected rejection for forbidden field: ${field}`
    );
  }
});

test("validateOnboardingBody: oversized field is rejected", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, companyName: "A".repeat(201) }),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.code === "BUS_OWNER_ONBOARDING_VALIDATION_FAILED" &&
      err.field === "companyName"
  );
});

test("validateOnboardingBody: swiftCode oversized is rejected", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, swiftCode: "X".repeat(21) }),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.field === "swiftCode"
  );
});

test("validateOnboardingBody: null or missing body throws typed error", () => {
  for (const bad of [null, undefined, "string", 42]) {
    assert.throws(
      () => validateOnboardingBody(bad),
      (err) =>
        err instanceof BusOwnerOnboardingValidationError &&
        err.code === "BUS_OWNER_ONBOARDING_VALIDATION_FAILED"
    );
  }
});

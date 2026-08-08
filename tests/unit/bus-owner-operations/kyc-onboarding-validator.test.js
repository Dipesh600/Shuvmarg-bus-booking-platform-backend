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
  assert.equal(result.bankName, "Nepal Bank Ltd.");
});

test("validateOnboardingBody: optional swiftCode may be omitted", () => {
  const result = validateOnboardingBody(VALID_BODY);
  assert.equal(result.swiftCode, null);
});

test("validateOnboardingBody: normalizes a valid lowercase SWIFT/BIC", () => {
  const result = validateOnboardingBody({ ...VALID_BODY, swiftCode: "nblnnpka" });
  assert.equal(result.swiftCode, "NBLNNPKA");
});

test("validateOnboardingBody: rejects invalid PAN, account and SWIFT formats", () => {
  for (const [field, value] of [
    ["panNumber", "12345ABC9"],
    ["panNumber", "12345678"],
    ["accountNumber", "1234<script>"],
    ["swiftCode", "NOT-A-BIC"],
  ]) {
    assert.throws(
      () => validateOnboardingBody({ ...VALID_BODY, [field]: value }),
      (err) =>
        err instanceof BusOwnerOnboardingValidationError && err.field === field,
      `Expected rejection for ${field}`
    );
  }
});

test("validateOnboardingBody: rejects control characters in text fields", () => {
  assert.throws(
    () => validateOnboardingBody({ ...VALID_BODY, companyName: "Safe\u0000Name" }),
    (err) =>
      err instanceof BusOwnerOnboardingValidationError &&
      err.field === "companyName"
  );
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

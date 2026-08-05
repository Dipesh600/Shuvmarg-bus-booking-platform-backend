"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAdminOwnerCreationBody,
} = require("../../../src/modules/admin/bus-owner-management/admin-owner-creation-request.policy");

test("admin-owner-creation-request-policy unit tests", async (t) => {
  const validBody = {
    companyName: "Shuvmarg Yatayat",
    ownerName: "Hari Bahadur",
    phone: "9841234567",
    email: "Hari@Example.COM",
    address: "Kathmandu",
    bankName: "Nabil Bank",
    accountHolderName: "Hari Bahadur",
    accountNumber: "001001001001",
    branchName: "Kantipath",
  };

  await t.test("accepts valid creation body and normalizes email and phone", async () => {
    const validated = validateAdminOwnerCreationBody(validBody);
    assert.equal(validated.companyName, "Shuvmarg Yatayat");
    assert.equal(validated.ownerName, "Hari Bahadur");
    assert.equal(validated.phone, "9841234567");
    assert.equal(validated.email, "hari@example.com");
  });

  await t.test("rejects unknown or forbidden fields", async () => {
    for (const key of ["role", "roles", "status", "verificationStatus", "isVerified", "kycReview", "kycAuditHistory", "user"]) {
      assert.throws(
        () => validateAdminOwnerCreationBody({ ...validBody, [key]: "hack" }),
        (err) => err.code === "ADMIN_CREATION_UNKNOWN_FIELD" && err.field === key
      );
    }
  });

  await t.test("rejects missing required fields", async () => {
    const incomplete = { ...validBody };
    delete incomplete.companyName;
    assert.throws(
      () => validateAdminOwnerCreationBody(incomplete),
      (err) => err.code === "ADMIN_CREATION_REQUIRED_FIELD_MISSING" && err.field === "companyName"
    );
  });

  await t.test("rejects non-string values or malformed email/phone", async () => {
    assert.throws(
      () => validateAdminOwnerCreationBody({ ...validBody, phone: "123" }),
      (err) => err.code === "ADMIN_CREATION_INVALID_PHONE"
    );
    assert.throws(
      () => validateAdminOwnerCreationBody({ ...validBody, email: "invalid-email" }),
      (err) => err.code === "ADMIN_CREATION_INVALID_EMAIL"
    );
  });
});

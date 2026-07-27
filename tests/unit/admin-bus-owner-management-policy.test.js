"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasRequiredOwnerFields,
  VALID_KYC_DOCUMENT_TYPES,
} = require("../../src/modules/admin/bus-owner-management/request-validation.policy");
const {
  applyDocumentVerdicts,
  invalidDocuments,
} = require("../../src/modules/admin/bus-owner-management/kyc-verdict.policy");

const validOwner = () => ({
  companyName: "Sumarg",
  ownerName: "Owner",
  phone: "9800000000",
  address: "Kathmandu",
  bankName: "Bank",
  accountHolderName: "Owner",
  accountNumber: "123",
  branchName: "Main",
});

test("admin bus-owner onboarding required-field policy", () => {
  assert.equal(hasRequiredOwnerFields(validOwner()), true);
  for (const field of Object.keys(validOwner())) {
    assert.equal(
      hasRequiredOwnerFields({ ...validOwner(), [field]: "" }),
      false,
      `${field} must remain required`
    );
  }
});

test("KYC re-upload accepts only the legacy document types", () => {
  assert.deepEqual(VALID_KYC_DOCUMENT_TYPES, [
    "companyRegistration",
    "ownerIdentity",
    "taxRegistration",
    "bankDetails",
  ]);
});

test("document verdicts preserve verification and rejection semantics", () => {
  const owner = {
    companyRegistration: { verified: false },
    taxRegistration: { verified: true },
    insuranceCertificates: [{ verified: false }],
  };
  applyDocumentVerdicts(owner, {
    companyRegistration: { verified: true, rejectionReason: "" },
    taxRegistration: { verified: false, rejectionReason: "Unreadable PAN" },
    insuranceCertificates: [
      { verified: false, rejectionReason: "Expired" },
    ],
  });
  assert.equal(owner.companyRegistration.verified, true);
  assert.equal(owner.taxRegistration.verified, false);
  assert.deepEqual(invalidDocuments(owner), [
    { label: "Tax Registration (PAN/VAT)", reason: "Unreadable PAN" },
    { label: "Insurance Certificate 1", reason: "Expired" },
  ]);
});

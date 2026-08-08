"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasKycSubmissionEvidence,
  getEffectiveKycStatus,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission-state");

test("new owner shell is not treated as submitted KYC", () => {
  const owner = { verificationStatus: "pending", companyName: "Shuvmarg" };
  assert.equal(hasKycSubmissionEvidence(owner), false);
  assert.equal(getEffectiveKycStatus(owner), "not_submitted");
});

test("stored required documents preserve the review status", () => {
  const owner = {
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["company.pdf"] },
    taxRegistration: { documentUrls: ["tax.pdf"] },
    transportLicense: { documentUrls: ["license.pdf"] },
  };
  assert.equal(hasKycSubmissionEvidence(owner), true);
  assert.equal(getEffectiveKycStatus(owner), "pending");
});

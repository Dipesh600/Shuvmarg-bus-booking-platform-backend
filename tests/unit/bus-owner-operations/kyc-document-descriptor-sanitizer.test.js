"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeKycDetailDescriptors } = require("../../../src/modules/bus-owner/kyc-document-read/kyc-document-descriptor-sanitizer");

test("KYC document descriptor sanitizer", async (t) => {
  await t.test("strips raw storage keys from owner detail responses", () => {
    const sanitized = sanitizeKycDetailDescriptors({
      companyRegistration: { documentUrls: ["owners/owner-1/kyc/secret.pdf"] },
      insuranceCertificates: [{ documentUrls: ["owners/owner-1/kyc/ins.pdf"] }],
    });
    assert.equal(sanitized.companyRegistration.documentUrls, undefined);
    assert.equal(sanitized.companyRegistration.documentReferences, undefined);
    assert.equal(sanitized.companyRegistration.available, true);
    assert.equal(sanitized.companyRegistration.fileCount, 1);
    assert.equal(sanitized.insuranceCertificates[0].documentUrls, undefined);
  });

  await t.test("strips document URLs at the owner status boundary", () => {
    const sanitized = sanitizeKycDetailDescriptors({
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["owners/1/kyc/reg.pdf"] },
      insuranceCertificates: [{ documentUrls: ["owners/1/kyc/ins.pdf"] }],
    });
    assert.equal(sanitized.companyRegistration.documentUrls, undefined);
    assert.equal(sanitized.insuranceCertificates[0].documentUrls, undefined);
    assert.equal(sanitized.companyRegistration.fileCount, 1);
  });

  await t.test("strips document references from admin details", () => {
    const sanitized = sanitizeKycDetailDescriptors({
      verificationStatus: "approved",
      companyRegistration: {
        documentUrls: ["owners/1/kyc/reg.pdf"],
        documentReferences: [{ storageReference: "owners/1/kyc/reg.pdf" }],
      },
    });
    assert.equal(sanitized.companyRegistration.documentUrls, undefined);
    assert.equal(sanitized.companyRegistration.documentReferences, undefined);
    assert.equal(sanitized.companyRegistration.fileCount, 1);
  });
});

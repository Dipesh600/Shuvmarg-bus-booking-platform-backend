"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycDocumentReadService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-read.service");

test("kyc-document-read.service unit tests", async (t) => {
  await t.test("resolveReference distinguishes S3 keys from legacy HTTP URLs", async () => {
    const getPresignedUrl = async (key) => `https://s3.signed.url/${key}?token=123`;
    const readService = createKycDocumentReadService({ getPresignedUrl });

    const s3Result = await readService.resolveReference("owners/1/kyc/doc.pdf");
    assert.deepEqual(s3Result, {
      storageReference: "owners/1/kyc/doc.pdf",
      viewUrl: "https://s3.signed.url/owners/1/kyc/doc.pdf?token=123",
      expiresInSeconds: 3600,
      legacy: false,
    });

    const httpResult = await readService.resolveReference("https://cloudinary.com/doc.pdf");
    assert.deepEqual(httpResult, {
      storageReference: "https://cloudinary.com/doc.pdf",
      viewUrl: "https://cloudinary.com/doc.pdf",
      expiresInSeconds: null,
      legacy: true,
    });
  });

  await t.test("resolveOwnerKycDocuments clones input and resolves all document sections including insurance", async () => {
    const getPresignedUrl = async (key) => `https://signed/${key}`;
    const readService = createKycDocumentReadService({ getPresignedUrl });

    const originalOwner = {
      verificationStatus: "pending",
      companyRegistration: { documentUrls: ["owners/1/kyc/company/doc1.pdf"] },
      taxRegistration: { documentUrls: ["https://legacy.url/tax.jpg"] },
      insuranceCertificates: [
        { insurerName: "AIC", documentUrls: ["owners/1/kyc/insurance/cert.pdf"] },
      ],
      dirtyField: 12345,
    };

    const resolved = await readService.resolveOwnerKycDocuments(originalOwner);

    // Immutable check
    assert.notEqual(resolved, originalOwner);
    assert.equal(originalOwner.companyRegistration.documentUrls[0], "owners/1/kyc/company/doc1.pdf");

    // Resolved output check
    assert.equal(resolved.companyRegistration.documentUrls[0], "https://signed/owners/1/kyc/company/doc1.pdf");
    assert.equal(resolved.companyRegistration.documentReferences[0].storageReference, "owners/1/kyc/company/doc1.pdf");
    assert.equal(resolved.taxRegistration.documentUrls[0], "https://legacy.url/tax.jpg");
    assert.equal(resolved.taxRegistration.documentReferences[0].legacy, true);
    assert.equal(resolved.insuranceCertificates[0].documentUrls[0], "https://signed/owners/1/kyc/insurance/cert.pdf");
  });

  await t.test("dirty historical DB values (null, numbers, non-strings) do not crash read service", async () => {
    const readService = createKycDocumentReadService({ getPresignedUrl: async () => "url" });

    assert.equal(await readService.resolveReference(null), null);
    assert.equal(await readService.resolveReference(12345), 12345);
    assert.equal(await readService.resolveReference(""), "");
  });
});

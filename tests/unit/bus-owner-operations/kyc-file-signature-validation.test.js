"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesSignature, validateFileSignature } = require("../../../src/modules/bus-owner/kyc-submission/kyc-file-signature.validator");
const { validateKycDocuments } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document.validator");
const { PDF_BUFFER, JPEG_BUFFER, PNG_BUFFER, makeFile, makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-file-signature-validation unit tests", async (t) => {
  await t.test("matchesSignature identifies magic bytes correctly", () => {
    assert.equal(matchesSignature(PDF_BUFFER, Buffer.from("%PDF-")), true);
    assert.equal(matchesSignature(Buffer.from("SHORT"), Buffer.from("%PDF-1.4")), false);
    assert.equal(matchesSignature(JPEG_BUFFER, Buffer.from([0xff, 0xd8, 0xff])), true);
  });

  await t.test("validateFileSignature returns format metadata on agreement", () => {
    const res = validateFileSignature({ buffer: PDF_BUFFER, mimeType: "application/pdf", extension: ".pdf", field: "companyRegistration" });
    assert.equal(res.detectedFormat, "pdf");
    assert.equal(res.safeExtension, "pdf");
    assert.equal(res.mime, "application/pdf");
  });

  await t.test("rejects unsupported MIME types", () => {
    const files = makeValidFiles();
    files.companyRegistration = makeFile("doc.exe", "application/x-msdownload", PDF_BUFFER);
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_FILE_TYPE_NOT_ALLOWED");
  });

  await t.test("rejects signature mismatches (PDF ext with EXE bytes, PNG bytes declared as JPEG MIME)", () => {
    const files = makeValidFiles();
    files.companyRegistration = makeFile("fake.pdf", "application/pdf", Buffer.from("MZ-NOT-A-PDF-BINARY"));
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_FILE_SIGNATURE_MISMATCH" && e.field === "companyRegistration");

    const files2 = makeValidFiles();
    files2.taxRegistration = makeFile("fake.jpg", "image/jpeg", PNG_BUFFER);
    assert.throws(() => validateKycDocuments(files2), (e) => e.code === "KYC_FILE_SIGNATURE_MISMATCH" && e.field === "taxRegistration");
  });

  await t.test("rejects malformed file endings and active PDF content", () => {
    const incomplete = makeValidFiles();
    incomplete.ownerIdentity = makeFile(
      "broken.png",
      "image/png",
      Buffer.concat([PNG_BUFFER.subarray(0, 8), Buffer.alloc(12)])
    );
    assert.throws(
      () => validateKycDocuments(incomplete),
      (e) => e.code === "KYC_UNSAFE_FILE_CONTENT"
    );

    const activePdf = makeValidFiles();
    activePdf.companyRegistration = makeFile(
      "active.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4\n1 0 obj\n<</OpenAction 2 0 R /JavaScript (alert)>>\nendobj\n%%EOF\n")
    );
    assert.throws(
      () => validateKycDocuments(activePdf),
      (e) => e.code === "KYC_UNSAFE_FILE_CONTENT"
    );
  });
});

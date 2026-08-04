"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateKycDocuments } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document.validator");
const { PDF_BUFFER, JPEG_BUFFER, makeFile, makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-document-request-validation unit tests", async (t) => {
  await t.test("accepts valid PDF, JPEG, and PNG files with correct signatures", () => {
    const files = makeValidFiles();
    const result = validateKycDocuments(files);
    assert.ok(result.companyRegistration);
    assert.ok(result.taxRegistration);
    assert.ok(result.transportLicense);
  });

  await t.test("accepts optional insurance files within max limit (<= 5)", () => {
    const files = makeValidFiles();
    files.insuranceCertificates = [
      makeFile("insurance1.pdf", "application/pdf", PDF_BUFFER),
      makeFile("insurance2.jpeg", "image/jpeg", JPEG_BUFFER),
    ];
    const result = validateKycDocuments(files);
    assert.equal(result.insuranceCertificates.length, 2);
  });

  await t.test("rejects missing or empty files object", () => {
    assert.throws(() => validateKycDocuments(null), (e) => e.code === "KYC_FILES_REQUIRED" && e.statusCode === 400);
    assert.throws(() => validateKycDocuments({}), (e) => e.code === "KYC_FILES_REQUIRED" && e.statusCode === 400);
  });

  await t.test("rejects unknown document fields", () => {
    const files = makeValidFiles();
    files.maliciousExtraFile = makeFile("hacked.pdf", "application/pdf", PDF_BUFFER);
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_UNKNOWN_DOCUMENT_FIELD" && e.field === "maliciousExtraFile");
  });

  await t.test("rejects missing required document fields", () => {
    const files = makeValidFiles();
    delete files.companyRegistration;
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_REQUIRED_DOCUMENT_MISSING" && e.field === "companyRegistration");
  });

  await t.test("rejects multiple files for single-document field", () => {
    const files = makeValidFiles();
    files.companyRegistration = [makeFile("comp1.pdf", "application/pdf", PDF_BUFFER), makeFile("comp2.pdf", "application/pdf", PDF_BUFFER)];
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_TOO_MANY_FILES" && e.field === "companyRegistration");
  });

  await t.test("rejects more than 5 insurance files", () => {
    const files = makeValidFiles();
    files.insuranceCertificates = Array(6).fill(makeFile("ins.pdf", "application/pdf", PDF_BUFFER));
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_TOO_MANY_FILES" && e.statusCode === 413);
  });

  await t.test("rejects zero-byte files", () => {
    const files = makeValidFiles();
    files.taxRegistration = makeFile("empty.jpg", "image/jpeg", Buffer.alloc(0));
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_EMPTY_FILE" && e.field === "taxRegistration");
  });

  await t.test("rejects files larger than 5 MB", () => {
    const files = makeValidFiles();
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    PDF_BUFFER.copy(largeBuffer, 0, 0, 10);
    files.companyRegistration = makeFile("huge.pdf", "application/pdf", largeBuffer);
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_FILE_TOO_LARGE" && e.statusCode === 413);
  });

  await t.test("rejects file payload with mismatched size metadata", () => {
    const files = makeValidFiles();
    files.taxRegistration.size = JPEG_BUFFER.length + 100;
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_INVALID_FILE_PAYLOAD");
  });

  await t.test("rejects malformed file objects (null/undefined in list, boolean, number, nested array, missing/non-Buffer data)", () => {
    const invalidValues = [
      [null], [undefined], true, 123, [PDF_BUFFER],
      { name: "doc.pdf", mimetype: "application/pdf" },
      { name: "doc.pdf", mimetype: "application/pdf", data: "not-a-buffer" },
    ];
    for (const val of invalidValues) {
      const files = makeValidFiles();
      files.companyRegistration = val;
      assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_INVALID_FILE_PAYLOAD" && e.field === "companyRegistration");
    }
  });
});

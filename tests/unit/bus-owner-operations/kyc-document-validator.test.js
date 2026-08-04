"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateKycDocuments,
  validateFilenameHygiene,
  matchesSignature,
} = require("../../../src/modules/bus-owner/kyc-submission/kyc-document.validator");

// Helper buffers for valid magic signatures
const PDF_BUFFER = Buffer.concat([Buffer.from("%PDF-1.4\n%"), Buffer.alloc(100)]);
const JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const PNG_BUFFER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);

function makeFile(name, mimetype, buffer) {
  return {
    name,
    mimetype,
    data: buffer,
    size: buffer.length,
  };
}

function makeValidFiles() {
  return {
    companyRegistration: makeFile("company.pdf", "application/pdf", PDF_BUFFER),
    taxRegistration: makeFile("tax.jpg", "image/jpeg", JPEG_BUFFER),
    transportLicense: makeFile("license.png", "image/png", PNG_BUFFER),
  };
}

test("kyc-document-validator unit tests", async (t) => {
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
    assert.throws(
      () => validateKycDocuments(null),
      (err) => err.code === "KYC_FILES_REQUIRED" && err.statusCode === 400
    );
    assert.throws(
      () => validateKycDocuments({}),
      (err) => err.code === "KYC_FILES_REQUIRED" && err.statusCode === 400
    );
  });

  await t.test("rejects unknown document fields", () => {
    const files = makeValidFiles();
    files.maliciousExtraFile = makeFile("hacked.pdf", "application/pdf", PDF_BUFFER);
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_UNKNOWN_DOCUMENT_FIELD" && err.field === "maliciousExtraFile"
    );
  });

  await t.test("rejects missing required document fields", () => {
    const files = makeValidFiles();
    delete files.companyRegistration;
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_REQUIRED_DOCUMENT_MISSING" && err.field === "companyRegistration"
    );
  });

  await t.test("rejects multiple files for single-document field", () => {
    const files = makeValidFiles();
    files.companyRegistration = [
      makeFile("comp1.pdf", "application/pdf", PDF_BUFFER),
      makeFile("comp2.pdf", "application/pdf", PDF_BUFFER),
    ];
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_TOO_MANY_FILES" && err.field === "companyRegistration"
    );
  });

  await t.test("rejects more than 5 insurance files", () => {
    const files = makeValidFiles();
    files.insuranceCertificates = Array(6).fill(
      makeFile("ins.pdf", "application/pdf", PDF_BUFFER)
    );
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_TOO_MANY_FILES" && err.statusCode === 413
    );
  });

  await t.test("rejects zero-byte files", () => {
    const files = makeValidFiles();
    files.taxRegistration = makeFile("empty.jpg", "image/jpeg", Buffer.alloc(0));
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_EMPTY_FILE" && err.field === "taxRegistration"
    );
  });

  await t.test("rejects files larger than 5 MB", () => {
    const files = makeValidFiles();
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    PDF_BUFFER.copy(largeBuffer, 0, 0, 10);
    files.companyRegistration = makeFile("huge.pdf", "application/pdf", largeBuffer);
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_FILE_TOO_LARGE" && err.statusCode === 413
    );
  });

  await t.test("rejects file payload with mismatched size metadata", () => {
    const files = makeValidFiles();
    files.taxRegistration.size = JPEG_BUFFER.length + 100;
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_INVALID_FILE_PAYLOAD"
    );
  });

  await t.test("rejects malformed file objects (null/undefined in list, boolean, number, nested array, missing/non-Buffer data)", () => {
    const invalidValues = [
      [null],
      [undefined],
      true,
      123,
      [PDF_BUFFER],
      { name: "doc.pdf", mimetype: "application/pdf" },
      { name: "doc.pdf", mimetype: "application/pdf", data: "not-a-buffer" },
    ];

    for (const val of invalidValues) {
      const files = makeValidFiles();
      files.companyRegistration = val;
      assert.throws(
        () => validateKycDocuments(files),
        (err) => err.code === "KYC_INVALID_FILE_PAYLOAD" && err.field === "companyRegistration",
        `Expected val ${JSON.stringify(val)} to throw KYC_INVALID_FILE_PAYLOAD`
      );
    }
  });

  await t.test("rejects malformed metadata types (non-string mimetype, non-string filename)", () => {
    const invalidMetadata = [
      { mimetype: {}, name: "doc.pdf" },
      { mimetype: [], name: "doc.pdf" },
      { mimetype: "application/pdf", name: 123 },
      { mimetype: "application/pdf", name: {} },
    ];

    for (const meta of invalidMetadata) {
      const files = makeValidFiles();
      files.companyRegistration = {
        data: PDF_BUFFER,
        size: PDF_BUFFER.length,
        ...meta,
      };
      assert.throws(
        () => validateKycDocuments(files),
        (err) => err.code === "KYC_INVALID_FILE_PAYLOAD" && err.field === "companyRegistration",
        `Expected metadata ${JSON.stringify(meta)} to throw KYC_INVALID_FILE_PAYLOAD`
      );
    }
  });

  await t.test("rejects unsafe or invalid filenames (null byte, path traversal)", () => {
    assert.throws(
      () => validateFilenameHygiene("doc\0.pdf", "taxRegistration"),
      (err) => err.code === "KYC_INVALID_FILE_PAYLOAD"
    );
    assert.throws(
      () => validateFilenameHygiene("../doc.pdf", "taxRegistration"),
      (err) => err.code === "KYC_INVALID_FILE_PAYLOAD"
    );
    assert.throws(
      () => validateFilenameHygiene(".pdf", "taxRegistration"),
      (err) => err.code === "KYC_FILE_EXTENSION_NOT_ALLOWED"
    );
  });

  await t.test("rejects unsupported MIME types and extensions", () => {
    const files = makeValidFiles();
    files.companyRegistration = makeFile("doc.exe", "application/x-msdownload", PDF_BUFFER);
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_FILE_TYPE_NOT_ALLOWED"
    );

    const files2 = makeValidFiles();
    files2.companyRegistration = makeFile("doc.txt", "application/pdf", PDF_BUFFER);
    assert.throws(
      () => validateKycDocuments(files2),
      (err) => err.code === "KYC_FILE_EXTENSION_NOT_ALLOWED"
    );
  });

  await t.test("rejects signature mismatches (PDF ext with EXE bytes, PNG bytes declared as JPEG MIME)", () => {
    const files = makeValidFiles();
    const fakePdf = makeFile("fake.pdf", "application/pdf", Buffer.from("MZ-NOT-A-PDF-BINARY"));
    files.companyRegistration = fakePdf;
    assert.throws(
      () => validateKycDocuments(files),
      (err) => err.code === "KYC_FILE_SIGNATURE_MISMATCH" && err.field === "companyRegistration"
    );

    const files2 = makeValidFiles();
    files2.taxRegistration = makeFile("fake.jpg", "image/jpeg", PNG_BUFFER);
    assert.throws(
      () => validateKycDocuments(files2),
      (err) => err.code === "KYC_FILE_SIGNATURE_MISMATCH" && err.field === "taxRegistration"
    );

    const files3 = makeValidFiles();
    files3.transportLicense = makeFile("license.jpg", "image/png", PNG_BUFFER);
    assert.throws(
      () => validateKycDocuments(files3),
      (err) => err.code === "KYC_FILE_SIGNATURE_MISMATCH"
    );
  });
});

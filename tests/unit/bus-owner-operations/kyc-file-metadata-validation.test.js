"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateFilenameHygiene, validateFileMetadata } = require("../../../src/modules/bus-owner/kyc-submission/kyc-file-metadata.validator");
const { validateKycDocuments } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document.validator");
const { PDF_BUFFER, makeValidFiles } = require("./helpers/kyc-test-fixtures");

test("kyc-file-metadata-validation unit tests", async (t) => {
  await t.test("validateFilenameHygiene rejects null byte, slashes, path traversal, and missing ext", () => {
    assert.throws(() => validateFilenameHygiene("doc\0.pdf", "tax"), (e) => e.code === "KYC_INVALID_FILE_PAYLOAD");
    assert.throws(() => validateFilenameHygiene("../doc.pdf", "tax"), (e) => e.code === "KYC_INVALID_FILE_PAYLOAD");
    assert.throws(() => validateFilenameHygiene(".pdf", "tax"), (e) => e.code === "KYC_FILE_EXTENSION_NOT_ALLOWED");
  });

  await t.test("validateFileMetadata extracts mime, filename and safe extension", () => {
    const meta = validateFileMetadata({ mimetype: "APPLICATION/PDF ", name: " company.pdf " }, "companyRegistration");
    assert.equal(meta.mimeType, "application/pdf");
    assert.equal(meta.fileName, "company.pdf");
    assert.equal(meta.extension, ".pdf");
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
      files.companyRegistration = { data: PDF_BUFFER, size: PDF_BUFFER.length, ...meta };
      assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_INVALID_FILE_PAYLOAD" && e.field === "companyRegistration");
    }
  });

  await t.test("rejects unsupported extensions", () => {
    const files = makeValidFiles();
    files.companyRegistration = { name: "doc.txt", mimetype: "application/pdf", data: PDF_BUFFER, size: PDF_BUFFER.length };
    assert.throws(() => validateKycDocuments(files), (e) => e.code === "KYC_FILE_EXTENSION_NOT_ALLOWED");
  });
});

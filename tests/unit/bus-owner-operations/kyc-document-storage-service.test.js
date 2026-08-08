"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycDocumentStorageService } = require("../../../src/modules/bus-owner/kyc-submission/kyc-document-storage.service");

test("kyc-document-storage.service unit tests", async (t) => {
  await t.test("uploadDocument generates correct path and uses safeExtension, ignoring file.name", async () => {
    const calls = [];
    const uploadFileToS3 = async (file, options) => {
      calls.push({ file, options });
      return `${options.folder}/${options.objectName}`;
    };
    const buildS3Path = ({ type, ownerId, documentType }) => `owners/${ownerId}/kyc/${documentType}`;
    const storageService = createKycDocumentStorageService({
      uploadFileToS3,
      deleteObjectFromS3: async () => {},
      buildS3Path,
      randomUUID: () => "uuid-1234",
    });

    const validatedFile = {
      file: { name: "untrusted-malicious.exe", buffer: Buffer.from("%PDF-1.4") },
      detectedFormat: "pdf",
      safeExtension: "pdf",
    };

    const key = await storageService.uploadDocument({
      validatedFile,
      ownerId: "owner-99",
      documentType: "companyRegistration",
    });

    assert.equal(key, "owners/owner-99/kyc/company-registration/uuid-1234.pdf");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].options, {
      folder: "owners/owner-99/kyc/company-registration",
      objectName: "uuid-1234.pdf",
    });
  });

  await t.test("deleteMany deletes valid S3 object keys and returns structured status without throwing on deletion error", async () => {
    const deletedKeys = [];
    const deleteObjectFromS3 = async (key) => {
      if (key.includes("fail")) throw new Error("S3 Delete Error");
      deletedKeys.push(key);
    };

    const storageService = createKycDocumentStorageService({
      uploadFileToS3: async () => {},
      deleteObjectFromS3,
      buildS3Path: () => "",
      logger: { error: () => {} },
    });

    const result = await storageService.deleteMany([
      "owners/1/kyc/c/ok.pdf",
      "https://cloudinary.com/legacy.pdf",
      "owners/1/kyc/c/fail.pdf",
      null,
      "",
    ]);

    assert.deepEqual(result.deleted, ["owners/1/kyc/c/ok.pdf"]);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].objectKey, "owners/1/kyc/c/fail.pdf");
    assert.equal(result.failed[0].error.message, "S3 Delete Error");
  });
});

"use strict";

const crypto = require("crypto");

const DOCUMENT_TYPE_SEGMENTS = Object.freeze({
  companyRegistration: "company-registration",
  taxRegistration: "tax-registration",
  transportLicense: "transport-license",
  insuranceCertificates: "insurance-certificate",
});

function createKycDocumentStorageService({
  uploadFileToS3,
  deleteObjectFromS3,
  buildS3Path,
  randomUUID = crypto.randomUUID,
  logger = console,
}) {
  async function uploadDocument({ validatedFile, ownerId, documentType }) {
    if (!validatedFile || !validatedFile.file || !validatedFile.safeExtension) {
      throw new Error("Invalid validatedFile payload for document upload.");
    }
    if (!ownerId) throw new Error("Owner ID is required for KYC document upload.");

    const segment = DOCUMENT_TYPE_SEGMENTS[documentType];
    if (!segment) throw new Error(`Unknown document type '${documentType}'.`);

    const folder = buildS3Path({
      type: "owner_kyc",
      ownerId: String(ownerId),
      documentType: segment,
    });

    const objectName = `${randomUUID()}.${validatedFile.safeExtension}`;
    return await uploadFileToS3(validatedFile.file, { folder, objectName });
  }

  async function deleteMany(objectKeys) {
    const deleted = [];
    const failed = [];

    if (!Array.isArray(objectKeys) || objectKeys.length === 0) {
      return { deleted, failed };
    }

    const validKeys = objectKeys.filter(
      (key) =>
        key &&
        typeof key === "string" &&
        !key.startsWith("http://") &&
        !key.startsWith("https://")
    );

    for (const objectKey of validKeys) {
      try {
        await deleteObjectFromS3(objectKey);
        deleted.push(objectKey);
      } catch (error) {
        if (logger && typeof logger.error === "function") {
          logger.error(`[KYC Storage] Failed to delete S3 key '${objectKey}':`, error);
        }
        failed.push({ objectKey, error });
      }
    }

    return { deleted, failed };
  }

  return { uploadDocument, deleteMany };
}

module.exports = {
  createKycDocumentStorageService,
  DOCUMENT_TYPE_SEGMENTS,
};

"use strict";

const { KYC_DOCUMENT_POLICY, MAX_INDIVIDUAL_FILE_SIZE, MAX_TOTAL_FILES } = require("./kyc-document.policy");
const { KycDocumentValidationError } = require("./kyc-submission.errors");
const { validateFileMetadata, validateFilenameHygiene } = require("./kyc-file-metadata.validator");
const { validateFileSignature, matchesSignature } = require("./kyc-file-signature.validator");

function validateSingleFile(file, field) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    throw new KycDocumentValidationError("KYC_INVALID_FILE_PAYLOAD", `Invalid file object for field '${field}'.`, field);
  }

  const buffer = file.data || file.buffer;
  if (!Buffer.isBuffer(buffer)) {
    throw new KycDocumentValidationError("KYC_INVALID_FILE_PAYLOAD", `Invalid file object for field '${field}'. Missing file binary buffer.`, field);
  }

  const { mimeType, extension } = validateFileMetadata(file, field);

  if (typeof file.size === "number" && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size !== buffer.length)) {
    throw new KycDocumentValidationError("KYC_INVALID_FILE_PAYLOAD", `File payload size mismatch in field '${field}'.`, field);
  }

  if (buffer.length === 0) {
    throw new KycDocumentValidationError("KYC_EMPTY_FILE", `Uploaded file for field '${field}' is empty (0 bytes).`, field);
  }

  if (buffer.length > MAX_INDIVIDUAL_FILE_SIZE) {
    throw new KycDocumentValidationError(
      "KYC_FILE_TOO_LARGE",
      `File in field '${field}' exceeds 5 MB size limit (${(buffer.length / 1024 / 1024).toFixed(2)} MB).`,
      field,
      413
    );
  }

  validateFileSignature({ buffer, mimeType, extension, field });
}

function validateKycDocuments(files) {
  if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
    throw new KycDocumentValidationError("KYC_FILES_REQUIRED", "No KYC documents were uploaded. Please attach all required files.");
  }

  const allowedFields = Object.keys(KYC_DOCUMENT_POLICY);
  const presentFields = Object.keys(files);

  for (const field of presentFields) {
    if (!allowedFields.includes(field)) {
      throw new KycDocumentValidationError("KYC_UNKNOWN_DOCUMENT_FIELD", `Unexpected document field '${field}' in request payload.`, field);
    }
  }

  for (const field of allowedFields) {
    const policy = KYC_DOCUMENT_POLICY[field];
    if (policy.required && (!files[field] || (Array.isArray(files[field]) && files[field].length === 0))) {
      throw new KycDocumentValidationError("KYC_REQUIRED_DOCUMENT_MISSING", `Required document field '${field}' is missing.`, field);
    }
  }

  let totalFileCount = 0;
  const normalizedFiles = {};

  for (const field of allowedFields) {
    const rawValue = files[field];
    if (!rawValue) continue;

    const fileList = Array.isArray(rawValue) ? rawValue : [rawValue];
    const policy = KYC_DOCUMENT_POLICY[field];

    if (!policy.multiple && fileList.length > 1) {
      throw new KycDocumentValidationError("KYC_TOO_MANY_FILES", `Field '${field}' accepts only a single file, but ${fileList.length} were provided.`, field);
    }

    if (policy.multiple && policy.maxFiles && fileList.length > policy.maxFiles) {
      throw new KycDocumentValidationError("KYC_TOO_MANY_FILES", `Field '${field}' exceeds maximum allowed count of ${policy.maxFiles} files.`, field, 413);
    }

    totalFileCount += fileList.length;

    if (totalFileCount > MAX_TOTAL_FILES) {
      throw new KycDocumentValidationError("KYC_TOO_MANY_FILES", `Total number of uploaded files (${totalFileCount}) exceeds limit of ${MAX_TOTAL_FILES}.`, field, 413);
    }

    for (const file of fileList) {
      validateSingleFile(file, field);
    }

    normalizedFiles[field] = fileList;
  }

  return normalizedFiles;
}

module.exports = {
  validateKycDocuments,
  validateFilenameHygiene,
  matchesSignature,
};

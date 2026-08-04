"use strict";

const path = require("path");
const {
  KYC_DOCUMENT_POLICY,
  MAX_INDIVIDUAL_FILE_SIZE,
  MAX_TOTAL_FILES,
  ALLOWED_TRIPLETS,
} = require("./kyc-document.policy");
const { KycDocumentValidationError } = require("./kyc-submission.errors");

function validateFilenameHygiene(filename, field) {
  if (typeof filename !== "string" || !filename.trim()) {
    throw new KycDocumentValidationError(
      "KYC_INVALID_FILE_PAYLOAD",
      `Document in ${field} has an invalid filename.`,
      field
    );
  }
  const name = filename.trim();
  if (
    name.includes("\0") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name === "." ||
    name === ".." ||
    name.endsWith(".")
  ) {
    throw new KycDocumentValidationError(
      "KYC_INVALID_FILE_PAYLOAD",
      `Filename for ${field} is invalid or contains unsafe characters.`,
      field
    );
  }

  const ext = path.extname(name).toLowerCase();
  const basename = path.basename(name, ext).trim();
  if (!basename || !ext) {
    throw new KycDocumentValidationError(
      "KYC_FILE_EXTENSION_NOT_ALLOWED",
      `Filename for ${field} must have a valid name and extension.`,
      field
    );
  }
  return ext;
}

function matchesSignature(buffer, signatureBuffer) {
  if (buffer.length < signatureBuffer.length) return false;
  for (let i = 0; i < signatureBuffer.length; i++) {
    if (buffer[i] !== signatureBuffer[i]) return false;
  }
  return true;
}

function validateFileTriplet(file, field) {
  const mimeType = (file.mimetype || "").trim().toLowerCase();
  const fileName = file.name || file.originalname;
  const extension = validateFilenameHygiene(fileName, field);

  const matchingTriplet = ALLOWED_TRIPLETS.find(
    (t) =>
      t.mime === mimeType &&
      t.extensions.includes(extension) &&
      matchesSignature(file.data || file.buffer, t.signature)
  );

  if (!matchingTriplet) {
    const validMime = ALLOWED_TRIPLETS.some((t) => t.mime === mimeType);
    if (!validMime) {
      throw new KycDocumentValidationError(
        "KYC_FILE_TYPE_NOT_ALLOWED",
        `MIME type '${mimeType}' for field '${field}' is not allowed.`,
        field
      );
    }

    const validExt = ALLOWED_TRIPLETS.some((t) => t.extensions.includes(extension));
    if (!validExt) {
      throw new KycDocumentValidationError(
        "KYC_FILE_EXTENSION_NOT_ALLOWED",
        `File extension '${extension}' for field '${field}' is not allowed.`,
        field
      );
    }

    throw new KycDocumentValidationError(
      "KYC_FILE_SIGNATURE_MISMATCH",
      `File format mismatch for field '${field}'. Declared MIME, extension, and binary signature must agree.`,
      field
    );
  }
}

function validateKycDocuments(files) {
  if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
    throw new KycDocumentValidationError(
      "KYC_FILES_REQUIRED",
      "No KYC documents were uploaded. Please attach all required files."
    );
  }

  const allowedFields = Object.keys(KYC_DOCUMENT_POLICY);
  const presentFields = Object.keys(files);

  for (const field of presentFields) {
    if (!allowedFields.includes(field)) {
      throw new KycDocumentValidationError(
        "KYC_UNKNOWN_DOCUMENT_FIELD",
        `Unexpected document field '${field}' in request payload.`,
        field
      );
    }
  }

  for (const field of allowedFields) {
    const policy = KYC_DOCUMENT_POLICY[field];
    if (policy.required && (!files[field] || (Array.isArray(files[field]) && files[field].length === 0))) {
      throw new KycDocumentValidationError(
        "KYC_REQUIRED_DOCUMENT_MISSING",
        `Required document field '${field}' is missing.`,
        field
      );
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
      throw new KycDocumentValidationError(
        "KYC_TOO_MANY_FILES",
        `Field '${field}' accepts only a single file, but ${fileList.length} were provided.`,
        field
      );
    }

    if (policy.multiple && policy.maxFiles && fileList.length > policy.maxFiles) {
      throw new KycDocumentValidationError(
        "KYC_TOO_MANY_FILES",
        `Field '${field}' exceeds maximum allowed count of ${policy.maxFiles} files.`,
        field,
        413
      );
    }

    totalFileCount += fileList.length;

    if (totalFileCount > MAX_TOTAL_FILES) {
      throw new KycDocumentValidationError(
        "KYC_TOO_MANY_FILES",
        `Total number of uploaded files (${totalFileCount}) exceeds limit of ${MAX_TOTAL_FILES}.`,
        field,
        413
      );
    }

    for (const file of fileList) {
      const buffer = file.data || file.buffer;

      if (!file || !Buffer.isBuffer(buffer)) {
        throw new KycDocumentValidationError(
          "KYC_INVALID_FILE_PAYLOAD",
          `Invalid file object for field '${field}'. Missing file binary buffer.`,
          field
        );
      }

      if (typeof file.size === "number") {
        if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size !== buffer.length) {
          throw new KycDocumentValidationError(
            "KYC_INVALID_FILE_PAYLOAD",
            `File payload size mismatch in field '${field}'.`,
            field
          );
        }
      }

      if (buffer.length === 0) {
        throw new KycDocumentValidationError(
          "KYC_EMPTY_FILE",
          `Uploaded file for field '${field}' is empty (0 bytes).`,
          field
        );
      }

      if (buffer.length > MAX_INDIVIDUAL_FILE_SIZE) {
        throw new KycDocumentValidationError(
          "KYC_FILE_TOO_LARGE",
          `File in field '${field}' exceeds 5 MB size limit (${(buffer.length / 1024 / 1024).toFixed(2)} MB).`,
          field,
          413
        );
      }

      validateFileTriplet(file, field);
    }

    normalizedFiles[field] = fileList;
  }

  return normalizedFiles;
}

module.exports = { validateKycDocuments, validateFilenameHygiene, matchesSignature };

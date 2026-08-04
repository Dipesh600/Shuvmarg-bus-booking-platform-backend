"use strict";

const path = require("path");
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

function validateFileMetadata(file, field) {
  const mimetype = file.mimetype;
  const fileName = file.name !== undefined ? file.name : file.originalname;

  if (typeof mimetype !== "string" || typeof fileName !== "string") {
    throw new KycDocumentValidationError(
      "KYC_INVALID_FILE_PAYLOAD",
      `Invalid file metadata type for field '${field}'.`,
      field
    );
  }

  const extension = validateFilenameHygiene(fileName, field);
  return {
    mimeType: mimetype.trim().toLowerCase(),
    fileName: fileName.trim(),
    extension,
  };
}

module.exports = {
  validateFilenameHygiene,
  validateFileMetadata,
};

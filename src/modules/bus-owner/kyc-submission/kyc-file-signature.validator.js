"use strict";

const { ALLOWED_TRIPLETS } = require("./kyc-document.policy");
const { KycDocumentValidationError } = require("./kyc-submission.errors");

function matchesSignature(buffer, signatureBuffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < signatureBuffer.length) return false;
  for (let i = 0; i < signatureBuffer.length; i++) {
    if (buffer[i] !== signatureBuffer[i]) return false;
  }
  return true;
}

function validateFileSignature({ buffer, mimeType, extension, field }) {
  const matchingTriplet = ALLOWED_TRIPLETS.find(
    (t) =>
      t.mime === mimeType &&
      t.extensions.includes(extension) &&
      matchesSignature(buffer, t.signature)
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

  return {
    format: matchingTriplet.format,
    safeExtension: matchingTriplet.extensions[0].replace(/^\./, ""),
    mime: matchingTriplet.mime,
  };
}

module.exports = {
  matchesSignature,
  validateFileSignature,
};

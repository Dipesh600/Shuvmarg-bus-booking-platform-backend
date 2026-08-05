"use strict";

function createDomainError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  createDomainError,
  invalidSlot: (slot) =>
    createDomainError(
      `Invalid document slot '${slot}'. Allowed: fitnessCert, insurance, bluebook, routePermit, fleetImages.`,
      400,
      "FLEET_DOCUMENT_INVALID_SLOT"
    ),
  fileRequired: (slot) =>
    createDomainError(
      `File upload required for slot '${slot}'.`,
      400,
      "FLEET_DOCUMENT_FILE_REQUIRED"
    ),
  unsupportedType: (type) =>
    createDomainError(
      `Unsupported file type '${type}'.`,
      400,
      "FLEET_DOCUMENT_UNSUPPORTED_TYPE"
    ),
  signatureMismatch: () =>
    createDomainError(
      "File header signature does not match declared MIME type or extension.",
      400,
      "FLEET_DOCUMENT_SIGNATURE_MISMATCH"
    ),
  fileTooLarge: (maxMb) =>
    createDomainError(
      `File size exceeds maximum limit of ${maxMb} MB.`,
      400,
      "FLEET_DOCUMENT_FILE_TOO_LARGE"
    ),
  invalidMetadata: (details) =>
    createDomainError(
      `Invalid metadata: ${details}`,
      400,
      "FLEET_DOCUMENT_INVALID_METADATA"
    ),
  reasonRequired: () =>
    createDomainError(
      "A changeReason (5-500 characters) is required when replacing a document or resubmitting a rejected slot.",
      400,
      "FLEET_DOCUMENT_REASON_REQUIRED"
    ),
  forbidden: (msg = "Access denied.") =>
    createDomainError(msg, 403, "FLEET_DOCUMENT_FORBIDDEN"),
  notFound: (msg = "Fleet document not found.") =>
    createDomainError(msg, 404, "FLEET_DOCUMENT_NOT_FOUND"),
  approvedImmutable: () =>
    createDomainError(
      "Approved fleet documents are immutable and cannot be replaced directly.",
      409,
      "APPROVED_FLEET_DOCUMENT_IMMUTABLE"
    ),
  slotNotRejected: (slot) =>
    createDomainError(
      `Slot '${slot}' is already approved or pending review and cannot be replaced while fleet is REJECTED.`,
      409,
      "FLEET_DOCUMENT_SLOT_NOT_REJECTED"
    ),
  concurrentModification: () =>
    createDomainError(
      "Fleet document was modified concurrently. Please reload and try again.",
      409,
      "FLEET_DOCUMENT_CONCURRENT_MODIFICATION"
    ),
  storageFailure: (msg = "Storage operation failed.") =>
    createDomainError(msg, 500, "FLEET_DOCUMENT_STORAGE_FAILURE"),
};

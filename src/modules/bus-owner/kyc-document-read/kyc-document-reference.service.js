"use strict";

const { KycDocumentReadError } = require("./kyc-document-read.errors");
const { assertCanReadBusOwnerKycDocument } = require("./kyc-document-read.policy");

const ALLOWED_DOCUMENT_TYPES = Object.freeze([
  "companyRegistration",
  "taxRegistration",
  "ownerIdentity",
]);

function isKycMalwareScanReady(busOwner, environment = process.env.NODE_ENV) {
  const scanStatus = busOwner?.kycSecurity?.malwareScanStatus;
  if (scanStatus === "clean") return true;
  if (environment !== "production" && scanStatus === "skipped_non_production") return true;
  if (environment !== "production" && !scanStatus) return true;
  return false;
}

function assertKycMalwareScanAllowsRead(busOwner, environment = process.env.NODE_ENV) {
  if (isKycMalwareScanReady(busOwner, environment)) return;

  throw new KycDocumentReadError(
    "KYC_DOCUMENT_SECURITY_SCAN_REQUIRED",
    "Document is quarantined until its security scan is complete.",
    423
  );
}

function parseNonNegativeIndex(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_INVALID_REQUEST",
      `${fieldName} must be a non-negative integer.`,
      400
    );
  }
  return Number(normalized);
}

function resolveAuthorizedKycDocumentReference({
  actor,
  busOwner,
  documentType,
  certificateIndex,
  fileIndex,
  logger = console,
}) {
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_INVALID_REQUEST",
      `Invalid or unknown document type '${documentType}'.`,
      400
    );
  }

  assertCanReadBusOwnerKycDocument({ actor, busOwner, logger });
  assertKycMalwareScanAllowsRead(busOwner);

  const cIdx = parseNonNegativeIndex(certificateIndex, "certificateIndex");
  const fIdx = parseNonNegativeIndex(fileIndex, "fileIndex");
  const section = busOwner[documentType];
  const urls = Array.isArray(section?.documentUrls) ? section.documentUrls : [];

  if (fIdx >= urls.length) {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_NOT_FOUND",
      "Requested document file index does not exist.",
      404
    );
  }

  const ref = urls[fIdx];
  if (!ref || typeof ref !== "string" || ref.trim() === "") {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_NOT_FOUND",
      "No valid document reference stored for the requested index.",
      404
    );
  }

  return {
    storageReference: ref.trim(),
    documentType,
    certificateIndex: cIdx,
    fileIndex: fIdx,
  };
}

module.exports = {
  ALLOWED_DOCUMENT_TYPES,
  parseNonNegativeIndex,
  isKycMalwareScanReady,
  assertKycMalwareScanAllowsRead,
  resolveAuthorizedKycDocumentReference,
};

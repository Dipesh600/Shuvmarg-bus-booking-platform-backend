"use strict";

const { KycDocumentReadError } = require("./kyc-document-read.errors");
const { assertCanReadBusOwnerKycDocument } = require("./kyc-document-read.policy");

const ALLOWED_DOCUMENT_TYPES = Object.freeze([
  "companyRegistration",
  "taxRegistration",
  "transportLicense",
  "insuranceCertificates",
  "ownerIdentity",
]);

function resolveAuthorizedKycDocumentReference({
  actor,
  busOwner,
  documentType,
  certificateIndex = 0,
  fileIndex = 0,
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

  const cIdx = parseInt(certificateIndex, 10) || 0;
  const fIdx = parseInt(fileIndex, 10) || 0;

  if (cIdx < 0 || fIdx < 0) {
    throw new KycDocumentReadError(
      "KYC_DOCUMENT_READ_INVALID_REQUEST",
      "Index parameters must be non-negative integers.",
      400
    );
  }

  let urls = [];

  if (documentType === "insuranceCertificates") {
    if (!Array.isArray(busOwner.insuranceCertificates) || cIdx >= busOwner.insuranceCertificates.length) {
      throw new KycDocumentReadError(
        "KYC_DOCUMENT_READ_NOT_FOUND",
        "Requested insurance certificate index does not exist.",
        404
      );
    }
    const cert = busOwner.insuranceCertificates[cIdx];
    urls = Array.isArray(cert?.documentUrls) ? cert.documentUrls : [];
  } else {
    const section = busOwner[documentType];
    urls = Array.isArray(section?.documentUrls) ? section.documentUrls : [];
  }

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
  resolveAuthorizedKycDocumentReference,
};

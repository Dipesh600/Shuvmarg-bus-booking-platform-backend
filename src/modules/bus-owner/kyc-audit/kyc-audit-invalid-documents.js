"use strict";

const { ALLOWED_INVALID_DOC_TYPES } = require("./kyc-audit.constants");

function sanitizeInvalidDocumentTypes(values) {
  if (!Array.isArray(values)) return [];
  const set = new Set();
  for (const item of values) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (ALLOWED_INVALID_DOC_TYPES.includes(trimmed)) {
        set.add(trimmed);
      }
    }
  }
  return ALLOWED_INVALID_DOC_TYPES.filter((type) => set.has(type));
}

function collectInvalidKycDocumentTypes(owner) {
  if (!owner || typeof owner !== "object") return [];
  const invalidList = [];

  const singleFields = [
    "companyRegistration",
    "ownerIdentity",
    "taxRegistration",
    "transportLicense",
  ];
  for (const field of singleFields) {
    if (owner[field] && owner[field].verified === false) {
      invalidList.push(field);
    }
  }

  if (Array.isArray(owner.insuranceCertificates)) {
    const hasUnverifiedInsurance = owner.insuranceCertificates.some(
      (cert) => cert && cert.verified === false
    );
    if (hasUnverifiedInsurance) {
      invalidList.push("insuranceCertificates");
    }
  }

  return sanitizeInvalidDocumentTypes(invalidList);
}

module.exports = {
  sanitizeInvalidDocumentTypes,
  collectInvalidKycDocumentTypes,
};

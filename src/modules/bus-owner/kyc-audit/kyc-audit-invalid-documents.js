"use strict";

const { ALLOWED_INVALID_DOC_TYPES } = require("./kyc-audit.constants");

function hasStoredDocument(section) {
  if (!section || typeof section !== "object") return false;
  const urls = Array.isArray(section.documentUrls) ? section.documentUrls : [];
  return urls.some((value) => typeof value === "string" && value.trim().length > 0);
}

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
  ];
  for (const field of singleFields) {
    const section = owner[field];
    if (hasStoredDocument(section) && section.verified === false) {
      invalidList.push(field);
    }
  }

  return sanitizeInvalidDocumentTypes(invalidList);
}

module.exports = {
  hasStoredDocument,
  sanitizeInvalidDocumentTypes,
  collectInvalidKycDocumentTypes,
};

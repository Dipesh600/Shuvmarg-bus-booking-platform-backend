"use strict";

const REQUIRED_DOCUMENT_FIELDS = Object.freeze([
  "companyRegistration",
  "taxRegistration",
  "transportLicense",
]);

function hasStoredDocument(section) {
  return Boolean(
    section &&
      Array.isArray(section.documentUrls) &&
      section.documentUrls.some((url) => typeof url === "string" && url.trim())
  );
}

function hasKycSubmissionEvidence(owner) {
  if (!owner) return false;
  return REQUIRED_DOCUMENT_FIELDS.some((field) =>
    hasStoredDocument(owner[field])
  );
}

function getEffectiveKycStatus(owner) {
  if (!owner || !hasKycSubmissionEvidence(owner)) return "not_submitted";
  return owner.verificationStatus || "pending";
}

module.exports = {
  REQUIRED_DOCUMENT_FIELDS,
  hasKycSubmissionEvidence,
  getEffectiveKycStatus,
};

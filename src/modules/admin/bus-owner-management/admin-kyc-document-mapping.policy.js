"use strict";

const { KycDocumentValidationError } = require("../../bus-owner/kyc-submission/kyc-submission.errors");

const ADMIN_KYC_FILE_MAPPING = Object.freeze({
  companyRegistrationCert: "companyRegistration",
  panCardImage: "taxRegistration",
  ownerCitizenship: "ownerIdentity",
  bankAuthorizationLetter: "bankDetails",
});

function normalizeAdminKycFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    return {};
  }

  const normalized = {};
  const presentFields = Object.keys(files);

  for (const field of presentFields) {
    const domainField = ADMIN_KYC_FILE_MAPPING[field];
    if (!domainField) {
      throw new KycDocumentValidationError(
        "KYC_UNKNOWN_DOCUMENT_FIELD",
        `Unexpected document field '${field}' in request payload.`,
        field
      );
    }
    normalized[domainField] = files[field];
  }

  return normalized;
}

module.exports = {
  ADMIN_KYC_FILE_MAPPING,
  normalizeAdminKycFiles,
};

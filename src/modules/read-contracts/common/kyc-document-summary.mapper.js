"use strict";

const { mapSingularKycDescriptor } = require("./kyc-document-presence.mapper");

const KYC_DOCUMENT_SLOTS = Object.freeze([
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
]);

function mapKycDocumentDescriptors(owner) {
  return {
    companyRegistration: mapSingularKycDescriptor(owner, "companyRegistration"),
    ownerIdentity: mapSingularKycDescriptor(owner, "ownerIdentity"),
    taxRegistration: mapSingularKycDescriptor(owner, "taxRegistration"),
  };
}

function calculateKycDocumentSummary(descriptors) {
  let present = 0;
  let missing = 0;
  let verified = 0;
  let unverified = 0;
  let rejected = 0;

  for (const slot of KYC_DOCUMENT_SLOTS) {
    const desc = descriptors[slot];
    if (desc.present) {
      present += 1;
      if (desc.verified) verified += 1;
      else {
        unverified += 1;
        if (desc.rejectionReason) rejected += 1;
      }
    } else {
      missing += 1;
    }
  }

  return {
    totalSlots: KYC_DOCUMENT_SLOTS.length,
    present,
    missing,
    verified,
    unverified,
    rejected,
  };
}

module.exports = {
  KYC_DOCUMENT_SLOTS,
  mapKycDocumentDescriptors,
  calculateKycDocumentSummary,
};

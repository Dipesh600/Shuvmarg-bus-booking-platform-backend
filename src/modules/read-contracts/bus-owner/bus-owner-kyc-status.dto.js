"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapKycDocumentDescriptors, calculateKycDocumentSummary } = require("../common/kyc-document-descriptor.mapper");

function mapBusOwnerKycStatus(owner) {
  if (!owner) return null;
  const docDescriptors = mapKycDocumentDescriptors(owner);
  const docSummary = calculateKycDocumentSummary(docDescriptors);

  return {
    ownerId: String(owner._id || owner.id),
    ownerCode: owner.busOwnerId || null,
    verificationStatus: owner.verificationStatus || "pending",
    rejectionReason: owner.rejectionReason || null,
    documents: docDescriptors,
    documentSummary: docSummary,
    createdAt: toIsoDate(owner.createdAt),
    updatedAt: toIsoDate(owner.updatedAt),
  };
}

module.exports = {
  mapBusOwnerKycStatus,
};

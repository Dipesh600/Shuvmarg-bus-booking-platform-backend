"use strict";

const { toIsoDate } = require("../common/read-date.mapper");
const { mapKycDocumentDescriptors, calculateKycDocumentSummary } = require("../common/kyc-document-descriptor.mapper");

function mapAdminReviewer(reviewer) {
  if (!reviewer) return null;
  if (typeof reviewer === "object" && reviewer._id) {
    return {
      adminId: String(reviewer._id),
      name: reviewer.name || reviewer.email || "Admin",
    };
  }
  return { adminId: String(reviewer), name: "Admin" };
}

function mapAdminKycDetail(owner) {
  if (!owner) return null;
  const user = owner.user || {};
  const docDescriptors = mapKycDocumentDescriptors(owner);
  const docSummary = calculateKycDocumentSummary(docDescriptors);

  return {
    ownerId: String(owner._id || owner.id),
    ownerCode: owner.busOwnerId || null,
    userId: user._id ? String(user._id) : (owner.user ? String(owner.user) : null),
    owner: {
      name: user.name || "N/A",
      email: user.email || "N/A",
      phone: user.phone || "N/A",
      companyName: owner.companyName || owner.companyRegistration?.companyName || "N/A",
    },
    verificationStatus: owner.verificationStatus || "pending",
    rejectionReason: owner.rejectionReason || null,
    documents: docDescriptors,
    documentSummary: docSummary,
    review: {
      approvedBy: mapAdminReviewer(owner.approvedBy),
      approvedAt: toIsoDate(owner.approvedAt),
      reviewedBy: mapAdminReviewer(owner.kycReview?.reviewedBy),
      reviewedAt: toIsoDate(owner.kycReview?.reviewedAt),
    },
    createdAt: toIsoDate(owner.createdAt),
    updatedAt: toIsoDate(owner.updatedAt),
  };
}

module.exports = {
  mapAdminKycDetail,
};

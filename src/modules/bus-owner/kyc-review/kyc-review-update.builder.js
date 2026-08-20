"use strict";

const { buildKycAuditEvent, collectInvalidKycDocumentTypes, KYC_AUDIT_EVENT, KYC_AUDIT_ACTOR } = require("../kyc-audit");
const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");

function buildReviewPersistence({ owner, reviewer, targetStatus, rejectionReason, reviewedAt }) {
  const invalidDocumentTypes = targetStatus === KYC_REVIEW_STATUS.REJECTED ? collectInvalidKycDocumentTypes(owner) : [];
  const auditEvent = buildKycAuditEvent({
    eventType: targetStatus === KYC_REVIEW_STATUS.APPROVED ? KYC_AUDIT_EVENT.APPROVED : KYC_AUDIT_EVENT.REJECTED,
    actorType: KYC_AUDIT_ACTOR.ADMIN,
    actorId: reviewer._id,
    fromStatus: KYC_REVIEW_STATUS.PENDING,
    toStatus: targetStatus,
    occurredAt: reviewedAt,
    metadata: { invalidDocumentTypes, reasonProvided: targetStatus === KYC_REVIEW_STATUS.REJECTED },
  });
  const updateFields = {
    verificationStatus: targetStatus,
    rejectionReason: targetStatus === KYC_REVIEW_STATUS.REJECTED ? rejectionReason : null,
    "kycReview.reviewedBy": reviewer._id,
    "kycReview.reviewedAt": reviewedAt,
  };
  for (const field of ["companyRegistration", "ownerIdentity", "taxRegistration"]) {
    if (owner[field]) {
      updateFields[`${field}.verified`] = owner[field].verified;
      updateFields[`${field}.rejectionReason`] = owner[field].rejectionReason || null;
    }
  }
  return { auditEvent, updateFields };
}

module.exports = { buildReviewPersistence };

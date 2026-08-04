"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { KYC_REVIEW_STATUS, assertKycReviewTransition } = require("./kyc-review.policy");
const { validateKycReviewRequest } = require("./kyc-review-request.policy");
const { resolveBusOwnerForReviewReference } = require("./kyc-review-reference.resolver");
const { syncReviewedOwnerUser } = require("./kyc-review-user-sync.service");

function createKycReviewService({
  BusOwner,
  User,
  applyDocumentVerdicts,
  invalidDocuments,
  clock = () => new Date(),
  logger = console,
}) {
  async function reviewKyc(body, reviewerId) {
    if (!reviewerId) {
      throw new KycReviewError("KYC_REVIEW_UNAUTHORIZED", "Unauthorized: Reviewer identity is required.", 401);
    }

    const { id, targetStatus, rejectionReason } = validateKycReviewRequest(body);
    const owner = await resolveBusOwnerForReviewReference({ id, BusOwner });

    assertKycReviewTransition({ currentStatus: owner.verificationStatus, targetStatus });

    if (typeof applyDocumentVerdicts === "function") {
      applyDocumentVerdicts(owner, body);
    }

    const updateFields = {
      verificationStatus: targetStatus,
      rejectionReason: targetStatus === KYC_REVIEW_STATUS.REJECTED ? rejectionReason : null,
      "kycReview.reviewedBy": reviewerId,
      "kycReview.reviewedAt": clock(),
    };

    const docFields = ["companyRegistration", "taxRegistration", "transportLicense"];
    for (const field of docFields) {
      if (owner[field]) {
        updateFields[`${field}.verified`] = owner[field].verified;
        updateFields[`${field}.rejectionReason`] = owner[field].rejectionReason || null;
      }
    }
    if (Array.isArray(owner.insuranceCertificates)) {
      updateFields.insuranceCertificates = owner.insuranceCertificates;
    }

    const updatedOwner = await BusOwner.findOneAndUpdate(
      { _id: owner._id, verificationStatus: KYC_REVIEW_STATUS.PENDING },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedOwner) {
      throw new KycReviewError(
        "KYC_REVIEW_INVALID_TRANSITION",
        `Cannot transition KYC review status from '${owner.verificationStatus}' to '${targetStatus}'.`,
        409
      );
    }

    try {
      await syncReviewedOwnerUser({ userId: updatedOwner.user, targetStatus, User, logger });
    } catch (userSyncErr) {
      logger.error("KYC review user sync failed for owner:", updatedOwner._id, userSyncErr);
      throw new KycReviewError("KYC_REVIEW_USER_SYNC_FAILED", "Internal Server Error", 500);
    }

    const invalidDocs = typeof invalidDocuments === "function" ? invalidDocuments(updatedOwner) : [];
    let userDoc = null;
    if (User && typeof User.findById === "function") {
      userDoc = await User.findById(updatedOwner.user).lean();
    }

    return {
      owner: updatedOwner,
      user: userDoc || { _id: updatedOwner.user },
      status: targetStatus,
      documents: invalidDocs,
      data: {
        busOwnerId: updatedOwner.busOwnerId || updatedOwner._id.toString(),
        verificationStatus: updatedOwner.verificationStatus,
        rejectionReason: updatedOwner.rejectionReason,
        kycReview: updatedOwner.kycReview,
      },
    };
  }

  return { reviewKyc };
}

module.exports = { createKycReviewService };

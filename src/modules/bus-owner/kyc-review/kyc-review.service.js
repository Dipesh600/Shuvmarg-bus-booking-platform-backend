"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { KYC_REVIEW_STATUS, assertKycReviewTransition } = require("./kyc-review.policy");
const { validateKycReviewRequest } = require("./kyc-review-request.policy");
const { resolveBusOwnerForReviewReference } = require("./kyc-review-reference.resolver");
const { syncReviewedOwnerUser } = require("./kyc-review-user-sync.service");
const { getKycReviewerActor, assertCanReviewBusOwnerKyc } = require("./kyc-review-actor.policy");
const { resolveKycReviewer } = require("./kyc-review-reviewer.resolver");
const { assertReviewerIsIndependent } = require("./kyc-review-separation-of-duty.policy");

function normalizeActorInput(actorInput) {
  if (
    actorInput &&
    typeof actorInput === "object" &&
    typeof actorInput.adminId === "string" &&
    actorInput.adminId.trim() &&
    typeof actorInput.tokenRole === "string" &&
    actorInput.tokenRole.trim()
  ) {
    return {
      adminId: actorInput.adminId.trim(),
      tokenRole: actorInput.tokenRole.trim(),
    };
  }
  if (actorInput && typeof actorInput === "object" && actorInput.adminInfo) {
    return getKycReviewerActor(actorInput);
  }

  throw new KycReviewError("KYC_REVIEW_UNAUTHORIZED", "Authenticated reviewer identity is required.", 401);
}

function createKycReviewService({
  Admin,
  BusOwner,
  User,
  applyDocumentVerdicts,
  invalidDocuments,
  clock = () => new Date(),
  logger = console,
}) {
  async function reviewKyc(body, actorInput) {
    const actor = normalizeActorInput(actorInput);
    const { id, targetStatus, rejectionReason } = validateKycReviewRequest(body);

    const reviewer = await resolveKycReviewer({ Admin, actor });
    assertCanReviewBusOwnerKyc({ reviewer, tokenRole: actor.tokenRole });

    const owner = await resolveBusOwnerForReviewReference({ id, BusOwner });

    let busOwnerUser = null;
    if (User && typeof User.findById === "function" && owner.user) {
      const q = User.findById(owner.user);
      busOwnerUser = q && typeof q.lean === "function" ? await q.lean() : await q;
    }

    assertReviewerIsIndependent({ reviewer, busOwner: owner, busOwnerUser });
    assertKycReviewTransition({ currentStatus: owner.verificationStatus, targetStatus });

    if (typeof applyDocumentVerdicts === "function") {
      applyDocumentVerdicts(owner, body);
    }

    const updateFields = {
      verificationStatus: targetStatus,
      rejectionReason: targetStatus === KYC_REVIEW_STATUS.REJECTED ? rejectionReason : null,
      "kycReview.reviewedBy": reviewer._id,
      "kycReview.reviewedAt": clock(),
    };

    const docFields = ["companyRegistration", "ownerIdentity", "taxRegistration", "transportLicense"];
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

    let syncedUser = null;
    try {
      syncedUser = await syncReviewedOwnerUser({ userId: updatedOwner.user, targetStatus, User, logger });
    } catch (userSyncErr) {
      logger.error("KYC review user sync failed for owner:", updatedOwner._id, userSyncErr);
      throw new KycReviewError("KYC_REVIEW_USER_SYNC_FAILED", "Internal Server Error", 500);
    }

    const invalidDocs = typeof invalidDocuments === "function" ? invalidDocuments(updatedOwner) : [];

    return {
      owner: updatedOwner,
      user: syncedUser || busOwnerUser || { _id: updatedOwner.user },
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

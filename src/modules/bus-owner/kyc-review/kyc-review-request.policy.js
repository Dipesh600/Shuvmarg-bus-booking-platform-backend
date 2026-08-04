"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");

function validateKycReviewRequest(body) {
  if (!body || typeof body !== "object") {
    throw new KycReviewError("KYC_REVIEW_INVALID_PAYLOAD", "Request body is required.", 400);
  }

  const id = body.id || body.busOwnerId;
  if (!id || typeof id !== "string" || id.trim() === "") {
    throw new KycReviewError("KYC_REVIEW_INVALID_PAYLOAD", "Id is required!", 400);
  }

  const targetStatus = body.verificationStatus;
  if (!targetStatus || (targetStatus !== KYC_REVIEW_STATUS.APPROVED && targetStatus !== KYC_REVIEW_STATUS.REJECTED)) {
    throw new KycReviewError(
      "KYC_REVIEW_INVALID_TARGET",
      "verificationStatus must be either 'approved' or 'rejected'.",
      400
    );
  }

  let rejectionReason = null;
  if (targetStatus === KYC_REVIEW_STATUS.REJECTED) {
    if (typeof body.rejectionReason !== "string" || body.rejectionReason.trim() === "") {
      throw new KycReviewError("KYC_REVIEW_REASON_REQUIRED", "Rejection reason is required.", 400);
    }
    rejectionReason = body.rejectionReason.trim();
  } else if (targetStatus === KYC_REVIEW_STATUS.APPROVED) {
    if (typeof body.rejectionReason === "string" && body.rejectionReason.trim() !== "") {
      throw new KycReviewError("KYC_REVIEW_REASON_NOT_ALLOWED", "Rejection reason is not allowed on approval.", 400);
    }
  }

  return {
    id: id.trim(),
    targetStatus,
    rejectionReason,
  };
}

module.exports = { validateKycReviewRequest };

"use strict";

const { KycReviewError } = require("./kyc-review.errors");

const KYC_REVIEW_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

function assertKycReviewTransition({ currentStatus, targetStatus }) {
  if (targetStatus !== KYC_REVIEW_STATUS.APPROVED && targetStatus !== KYC_REVIEW_STATUS.REJECTED) {
    throw new KycReviewError(
      "KYC_REVIEW_INVALID_TARGET",
      `Target status '${targetStatus}' is invalid. Allowed statuses are 'approved' or 'rejected'.`,
      400
    );
  }

  if (currentStatus !== KYC_REVIEW_STATUS.PENDING) {
    throw new KycReviewError(
      "KYC_REVIEW_INVALID_TRANSITION",
      `Cannot transition KYC review status from '${currentStatus}' to '${targetStatus}'.`,
      409
    );
  }
}

module.exports = {
  KYC_REVIEW_STATUS,
  assertKycReviewTransition,
};

"use strict";

const { KycReviewError } = require("./kyc-review.errors");

const ALLOWED_REVIEWER_ROLES = Object.freeze(["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"]);

function getKycReviewerActor(req) {
  const adminId = req?.adminInfo?.id || req?.adminInfo?._id;

  if (!adminId) {
    throw new KycReviewError(
      "KYC_REVIEW_UNAUTHORIZED",
      "Authenticated reviewer identity is required.",
      401
    );
  }

  return {
    adminId: String(adminId),
    tokenRole: req.adminInfo.role || null,
  };
}

function assertCanReviewBusOwnerKyc({ reviewer, tokenRole }) {
  if (!reviewer || typeof reviewer !== "object") {
    throw new KycReviewError(
      "KYC_REVIEW_UNAUTHORIZED",
      "Reviewer account was not found.",
      401
    );
  }

  if (reviewer.isActive === false) {
    throw new KycReviewError(
      "KYC_REVIEW_FORBIDDEN",
      "Admin account has been deactivated.",
      403
    );
  }

  if (reviewer.accountLocked === true) {
    throw new KycReviewError(
      "KYC_REVIEW_FORBIDDEN",
      "Admin account is locked due to security policy.",
      403
    );
  }

  if (!ALLOWED_REVIEWER_ROLES.includes(reviewer.role)) {
    throw new KycReviewError(
      "KYC_REVIEW_FORBIDDEN",
      "Access denied. Reviewer privileges required.",
      403
    );
  }

  if (tokenRole && tokenRole !== reviewer.role) {
    throw new KycReviewError(
      "KYC_REVIEW_FORBIDDEN",
      "Your admin role has been updated. Please login again.",
      403
    );
  }
}

module.exports = {
  ALLOWED_REVIEWER_ROLES,
  getKycReviewerActor,
  assertCanReviewBusOwnerKyc,
};

"use strict";

const { KycReviewError } = require("./kyc-review.errors");

async function resolveKycReviewer({ Admin, actor }) {
  if (!actor || !actor.adminId) {
    throw new KycReviewError(
      "KYC_REVIEW_UNAUTHORIZED",
      "Authenticated reviewer identity is required.",
      401
    );
  }

  if (!Admin || typeof Admin.findById !== "function") {
    throw new KycReviewError(
      "KYC_REVIEW_UNAUTHORIZED",
      "Admin model is required to resolve reviewer.",
      401
    );
  }

  let query = Admin.findById(actor.adminId);
  if (query && typeof query.lean === "function") {
    query = query.lean();
  }
  const reviewer = await query;

  if (!reviewer) {
    throw new KycReviewError(
      "KYC_REVIEW_UNAUTHORIZED",
      "Reviewer account was not found.",
      401
    );
  }

  return reviewer;
}

module.exports = { resolveKycReviewer };

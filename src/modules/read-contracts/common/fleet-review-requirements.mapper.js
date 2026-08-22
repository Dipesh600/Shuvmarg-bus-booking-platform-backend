"use strict";

const { toIsoDate } = require("./read-date.mapper");
const {
  DOCUMENT_REVIEW_KEYS,
  SECTION_REVIEW_KEYS,
} = require("../../admin/fleet-management/fleet-review-requirements");

function mapReview(review = {}) {
  return {
    status: String(review.status || "pending").toUpperCase(),
    reason: review.reason || null,
    reviewedAt: toIsoDate(review.reviewedAt),
    reviewedBy: review.reviewedBy ? String(review.reviewedBy._id || review.reviewedBy) : null,
  };
}

function mapFleetReviewRequirements(fleet) {
  const requirements = {};
  for (const key of DOCUMENT_REVIEW_KEYS) requirements[key] = mapReview(fleet?.documentReviews?.[key]);
  for (const key of SECTION_REVIEW_KEYS) requirements[key] = mapReview(fleet?.sectionReviews?.[key]);
  return requirements;
}

module.exports = { mapFleetReviewRequirements };

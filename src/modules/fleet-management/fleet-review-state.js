"use strict";

function hasGranularReviewDecision(fleet) {
  const reviews = [
    ...Object.values(fleet?.documentReviews || {}),
    ...Object.values(fleet?.sectionReviews || {}),
  ];
  return reviews.some((review) => ["approved", "rejected"].includes(review?.status));
}

function isLegacyOverallRejection(fleet) {
  return fleet?.approvalStatus === "REJECTED" && !hasGranularReviewDecision(fleet);
}

module.exports = { hasGranularReviewDecision, isLegacyOverallRejection };

"use strict";

const {
  DOCUMENT_REVIEW_KEYS,
  SECTION_REVIEW_KEYS,
} = require("../admin/fleet-management/fleet-review-requirements");

function unresolvedCorrections(fleet) {
  return [
    ...DOCUMENT_REVIEW_KEYS.filter((key) => fleet.documentReviews?.[key]?.status === "rejected"),
    ...SECTION_REVIEW_KEYS.filter((key) => fleet.sectionReviews?.[key]?.status === "rejected"),
  ];
}

function buildPendingReviewState(fleet) {
  const update = {};
  for (const key of DOCUMENT_REVIEW_KEYS) {
    if (fleet.documentReviews?.[key]?.status !== "approved") {
      update[`documentReviews.${key}`] = { status: "pending", reason: null, reviewedBy: null, reviewedAt: null };
    }
  }
  for (const key of SECTION_REVIEW_KEYS) {
    if (fleet.sectionReviews?.[key]?.status !== "approved") {
      update[`sectionReviews.${key}`] = { status: "pending", reason: null, reviewedBy: null, reviewedAt: null };
    }
  }
  return update;
}

module.exports = { unresolvedCorrections, buildPendingReviewState };

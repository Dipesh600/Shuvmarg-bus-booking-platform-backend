"use strict";

const DOCUMENT_REVIEW_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

const DOCUMENT_REVIEW_VALUES = Object.freeze(
  Object.values(DOCUMENT_REVIEW_STATUS)
);

const DOCUMENT_REVIEW_LABELS = Object.freeze({
  [DOCUMENT_REVIEW_STATUS.PENDING]: "Pending Review",
  [DOCUMENT_REVIEW_STATUS.APPROVED]: "Approved",
  [DOCUMENT_REVIEW_STATUS.REJECTED]: "Rejected",
});

function isDocumentReviewStatus(value) {
  return typeof value === "string" && DOCUMENT_REVIEW_VALUES.includes(value);
}

function getDocumentReviewLabel(value) {
  if (!isDocumentReviewStatus(value)) return null;
  return DOCUMENT_REVIEW_LABELS[value] || null;
}

module.exports = {
  DOCUMENT_REVIEW_STATUS,
  DOCUMENT_REVIEW_VALUES,
  DOCUMENT_REVIEW_LABELS,
  isDocumentReviewStatus,
  getDocumentReviewLabel,
};

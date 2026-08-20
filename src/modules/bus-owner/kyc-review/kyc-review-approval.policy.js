"use strict";

const { KycReviewError } = require("./kyc-review.errors");
const { REQUIRED_DOCUMENT_FIELDS, hasStoredDocument } = require("../kyc-submission/kyc-submission-state");
const { KYC_REVIEW_STATUS } = require("./kyc-review.policy");

function assertApprovalRequirements(owner, targetStatus) {
  if (targetStatus !== KYC_REVIEW_STATUS.APPROVED) return "";
  const companyName = (owner.companyName || "").trim();
  if (!companyName) {
    throw new KycReviewError("KYC_REVIEW_MISSING_COMPANY_NAME", "Company name is required before approving bus owner KYC.", 409);
  }
  const missing = REQUIRED_DOCUMENT_FIELDS.filter((field) => !hasStoredDocument(owner[field]));
  if (missing.length > 0) {
    throw new KycReviewError(
      "KYC_REVIEW_REQUIRED_DOCUMENTS_MISSING",
      "Company registration, PAN/VAT registration and owner citizenship are required before approval.",
      409
    );
  }
  return companyName;
}

module.exports = { assertApprovalRequirements };

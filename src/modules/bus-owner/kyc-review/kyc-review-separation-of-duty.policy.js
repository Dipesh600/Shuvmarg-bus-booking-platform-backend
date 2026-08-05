"use strict";

const { KycReviewError } = require("./kyc-review.errors");

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let p = String(value).replace(/[\s\-\(\)]/g, "");
  if (!p) return null;

  if (p.startsWith("+977")) p = p.slice(4);
  else if (p.startsWith("977") && p.length > 10) p = p.slice(3);
  if (p.startsWith("0") && p.length === 11) p = p.slice(1);

  return p.length > 0 ? p : null;
}

function assertReviewerIsIndependent({ reviewer, busOwner, busOwnerUser }) {
  if (!reviewer || typeof reviewer !== "object") return;

  const reviewerId = reviewer._id ? String(reviewer._id) : null;
  const ownerUserId = busOwner?.user ? String(busOwner.user) : null;

  if (reviewerId && ownerUserId && reviewerId === ownerUserId) {
    throw new KycReviewError(
      "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN",
      "You cannot review a KYC application connected to your own account.",
      409
    );
  }

  const rEmail = normalizeEmail(reviewer.email);
  const uEmail = normalizeEmail(busOwnerUser?.email);
  const oEmail = normalizeEmail(busOwner?.email || busOwner?.companyRegistration?.email);

  if (rEmail && ((uEmail && rEmail === uEmail) || (oEmail && rEmail === oEmail))) {
    throw new KycReviewError(
      "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN",
      "You cannot review a KYC application connected to your own account.",
      409
    );
  }

  const rPhone = normalizePhone(reviewer.phoneNumber || reviewer.phone);
  const uPhone = normalizePhone(busOwnerUser?.phone || busOwnerUser?.phoneNumber);
  const oPhone = normalizePhone(busOwner?.phone || busOwner?.phoneNumber);

  if (rPhone && ((uPhone && rPhone === uPhone) || (oPhone && rPhone === oPhone))) {
    throw new KycReviewError(
      "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN",
      "You cannot review a KYC application connected to your own account.",
      409
    );
  }
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  assertReviewerIsIndependent,
};

"use strict";

const mongoose = require("mongoose");
const { FleetApprovalError } = require("./fleet-approval.errors");
const { FLEET_REVIEW_KEYS, REVIEW_DECISIONS } = require("./fleet-review-requirements");

const ALLOWED_FIELDS = Object.freeze(["fleetId", "status", "rejectionReason", "reviews"]);

function validateReviews(reviews, status) {
  if (!reviews || typeof reviews !== "object" || Array.isArray(reviews)) {
    throw new FleetApprovalError("FLEET_REVIEWS_REQUIRED", "Review every fleet section before making a final decision.", 400, "reviews");
  }
  const unknown = Object.keys(reviews).find((key) => !FLEET_REVIEW_KEYS.includes(key));
  if (unknown) {
    throw new FleetApprovalError("FLEET_REVIEW_UNKNOWN_KEY", `Unknown fleet review section '${unknown}'.`, 400, `reviews.${unknown}`);
  }
  const normalized = {};
  for (const key of FLEET_REVIEW_KEYS) {
    const item = reviews[key];
    if (!item || typeof item !== "object" || !REVIEW_DECISIONS.includes(item.status)) {
      throw new FleetApprovalError("FLEET_REVIEW_INCOMPLETE", `Complete the review for '${key}'.`, 400, `reviews.${key}`);
    }
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (item.status === "REJECTED" && (reason.length < 5 || reason.length > 500)) {
      throw new FleetApprovalError("FLEET_REVIEW_REASON_REQUIRED", `A reason between 5 and 500 characters is required for '${key}'.`, 400, `reviews.${key}.reason`);
    }
    normalized[key] = { status: item.status, reason: item.status === "REJECTED" ? reason : null };
  }
  const rejected = Object.values(normalized).filter((item) => item.status === "REJECTED");
  if (status === "APPROVED" && rejected.length > 0) {
    throw new FleetApprovalError("FLEET_REVIEW_HAS_REJECTIONS", "A fleet with requested changes cannot be approved.", 409, "reviews");
  }
  if (status === "REJECTED" && rejected.length === 0) {
    throw new FleetApprovalError("FLEET_REVIEW_REJECTION_REQUIRED", "Request a change in at least one fleet section.", 400, "reviews");
  }
  return normalized;
}

function validateFleetStatusRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_BODY", "Request body must be an object.", 400);
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.includes(key)) {
      throw new FleetApprovalError("FLEET_STATUS_UNKNOWN_FIELD", `Unexpected field '${key}' in request body.`, 400, key);
    }
  }

  const { fleetId, status, rejectionReason } = body;

  if (!fleetId) {
    throw new FleetApprovalError("FLEET_STATUS_FLEET_ID_REQUIRED", "fleetId is required.", 400, "fleetId");
  }

  if (typeof fleetId !== "string" || !mongoose.Types.ObjectId.isValid(fleetId)) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_ID", "fleetId must be a valid Mongo ObjectId string.", 400, "fleetId");
  }

  if (!status || typeof status !== "string" || !["APPROVED", "REJECTED"].includes(status)) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_STATUS", "Invalid status. Allowed values: APPROVED, REJECTED", 400, "status");
  }

  if (status === "APPROVED") {
    if (rejectionReason !== undefined && rejectionReason !== null) {
      throw new FleetApprovalError("FLEET_APPROVAL_REASON_NOT_ALLOWED", "rejectionReason is forbidden for APPROVED status.", 400, "rejectionReason");
    }
    const reviews = validateReviews(body.reviews, status);
    return {
      fleetId,
      decision: "APPROVED",
      rejectionReason: null,
      reviews,
    };
  }

  if (rejectionReason === undefined || rejectionReason === null || typeof rejectionReason !== "string") {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason is required for REJECTED status.", 400, "rejectionReason");
  }

  const trimmedReason = rejectionReason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason must be between 5 and 500 characters.", 400, "rejectionReason");
  }
  const reviews = validateReviews(body.reviews, status);

  return {
    fleetId,
    decision: "REJECTED",
    rejectionReason: trimmedReason,
    reviews,
  };
}

module.exports = { validateFleetStatusRequest, validateReviews, ALLOWED_FIELDS };

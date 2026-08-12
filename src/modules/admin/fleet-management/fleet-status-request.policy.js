"use strict";

const mongoose = require("mongoose");
const { FleetApprovalError } = require("./fleet-approval.errors");

const ALLOWED_FIELDS = Object.freeze(["fleetId", "status", "rejectionReason", "documentReviews"]);
const ALLOWED_DOCUMENT_REVIEW_SLOTS = Object.freeze([
  "fleetImages",
  "fitnessCert",
  "insurance",
  "bluebook",
  "routePermit",
]);
const ALLOWED_DOCUMENT_REVIEW_STATUSES = Object.freeze(["approved", "rejected", "pending"]);

function validateDocumentReviews(documentReviews) {
  if (documentReviews === undefined || documentReviews === null) return null;
  if (typeof documentReviews !== "object" || Array.isArray(documentReviews)) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_DOCUMENT_REVIEWS", "documentReviews must be an object.", 400, "documentReviews");
  }

  const normalized = {};
  for (const [slot, review] of Object.entries(documentReviews)) {
    if (!ALLOWED_DOCUMENT_REVIEW_SLOTS.includes(slot)) {
      throw new FleetApprovalError("FLEET_STATUS_INVALID_DOCUMENT_REVIEWS", `Invalid document review slot '${slot}'.`, 400, "documentReviews");
    }
    if (!review || typeof review !== "object" || Array.isArray(review)) {
      throw new FleetApprovalError("FLEET_STATUS_INVALID_DOCUMENT_REVIEWS", `Review for '${slot}' must be an object.`, 400, "documentReviews");
    }

    const status = typeof review.status === "string" ? review.status.trim().toLowerCase() : "";
    if (!ALLOWED_DOCUMENT_REVIEW_STATUSES.includes(status)) {
      throw new FleetApprovalError("FLEET_STATUS_INVALID_DOCUMENT_REVIEWS", `Invalid review status for '${slot}'.`, 400, "documentReviews");
    }

    const rawReason = review.reason ?? review.rejectionReason ?? null;
    const reason = rawReason === null || rawReason === undefined ? null : String(rawReason).trim();
    if (status === "rejected" && (!reason || reason.length < 5 || reason.length > 500)) {
      throw new FleetApprovalError("FLEET_STATUS_INVALID_DOCUMENT_REVIEWS", `A 5-500 character reason is required for rejected '${slot}'.`, 400, "documentReviews");
    }

    normalized[slot] = {
      status,
      reason: status === "rejected" ? reason : null,
    };
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
  const documentReviews = validateDocumentReviews(body.documentReviews);

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
    const approvedResult = {
      fleetId,
      decision: "APPROVED",
      rejectionReason: null,
    };
    if (documentReviews) approvedResult.documentReviews = documentReviews;
    return approvedResult;
  }

  if (rejectionReason === undefined || rejectionReason === null || typeof rejectionReason !== "string") {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason is required for REJECTED status.", 400, "rejectionReason");
  }

  const trimmedReason = rejectionReason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason must be between 5 and 500 characters.", 400, "rejectionReason");
  }

  const rejectedResult = {
    fleetId,
    decision: "REJECTED",
    rejectionReason: trimmedReason,
  };
  if (documentReviews) rejectedResult.documentReviews = documentReviews;
  return rejectedResult;
}

module.exports = { validateFleetStatusRequest, ALLOWED_FIELDS };

"use strict";

const mongoose = require("mongoose");
const { FleetApprovalError } = require("./fleet-approval.errors");

const ALLOWED_FIELDS = Object.freeze(["fleetId", "status", "rejectionReason"]);

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
    return {
      fleetId,
      decision: "APPROVED",
      rejectionReason: null,
    };
  }

  if (rejectionReason === undefined || rejectionReason === null || typeof rejectionReason !== "string") {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason is required for REJECTED status.", 400, "rejectionReason");
  }

  const trimmedReason = rejectionReason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    throw new FleetApprovalError("FLEET_STATUS_INVALID_REJECTION_REASON", "rejectionReason must be between 5 and 500 characters.", 400, "rejectionReason");
  }

  return {
    fleetId,
    decision: "REJECTED",
    rejectionReason: trimmedReason,
  };
}

module.exports = { validateFleetStatusRequest, ALLOWED_FIELDS };

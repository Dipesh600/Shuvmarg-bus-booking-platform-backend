"use strict";

const { FLEET_APPROVAL_EVENTS } = require("./fleet-approval.constants");
const { FleetApprovalError } = require("./fleet-approval.errors");

function buildFleetApprovalAuditEvent({ decision, actorId, occurredAt, rejectionReason }) {
  if (!actorId) {
    throw new FleetApprovalError("FLEET_APPROVAL_ACTOR_REQUIRED", "Actor ID is required for audit event.", 400);
  }
  if (!occurredAt || !(occurredAt instanceof Date) || isNaN(occurredAt.getTime())) {
    throw new FleetApprovalError("FLEET_APPROVAL_DATE_INVALID", "Valid occurredAt date is required for audit event.", 400);
  }

  if (decision === "APPROVED") {
    return {
      eventType: FLEET_APPROVAL_EVENTS.APPROVED,
      actorType: "ADMIN",
      actorId,
      fromStatus: "PENDING",
      toStatus: "APPROVED",
      occurredAt,
      metadata: {},
    };
  }

  if (decision === "REJECTED") {
    return {
      eventType: FLEET_APPROVAL_EVENTS.REJECTED,
      actorType: "ADMIN",
      actorId,
      fromStatus: "PENDING",
      toStatus: "REJECTED",
      occurredAt,
      metadata: {
        rejectionReason: rejectionReason || undefined,
      },
    };
  }

  throw new FleetApprovalError("FLEET_APPROVAL_DECISION_INVALID", "Invalid decision type for audit event.", 400);
}

module.exports = { buildFleetApprovalAuditEvent };

"use strict";

const { ALLOWED_PROFILE_FIELDS } = require("./admin-owner-profile.constants");
const { AdminOwnerProfileError } = require("./admin-owner-profile.errors");

const VALID_AUDIT_FIELDS = ALLOWED_PROFILE_FIELDS.filter(
  (k) => k !== "id" && k !== "changeReason"
);

function buildAdminOwnerProfileAuditEvent({
  actorId,
  occurredAt,
  reason,
  ownerVerificationStatus,
  changedFields,
}) {
  if (!actorId) {
    throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_ACTOR_REQUIRED", "Actor ID is required for audit event.", 400);
  }
  if (!occurredAt || !(occurredAt instanceof Date) || isNaN(occurredAt.getTime())) {
    throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_DATE_INVALID", "Valid occurredAt date is required for audit event.", 400);
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > 500) {
    throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_REASON_INVALID", "Valid change reason (<= 500 chars) is required for audit event.", 400);
  }
  if (!["pending", "approved", "rejected"].includes(ownerVerificationStatus)) {
    throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_STATUS_INVALID", "Valid owner verification status is required for audit event.", 400);
  }
  if (!Array.isArray(changedFields) || changedFields.length === 0) {
    throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_FIELDS_REQUIRED", "Non-empty changedFields array is required for audit event.", 400);
  }

  for (const field of changedFields) {
    if (!VALID_AUDIT_FIELDS.includes(field)) {
      throw new AdminOwnerProfileError("OWNER_PROFILE_AUDIT_FIELD_INVALID", `Invalid audit field '${field}'.`, 400, { field });
    }
  }

  const uniqueSortedFields = Array.from(new Set(changedFields)).sort();

  return {
    eventType: "ADMIN_PROFILE_UPDATED",
    actorType: "ADMIN",
    actorId,
    occurredAt,
    reason: reason.trim(),
    ownerVerificationStatus,
    changedFields: uniqueSortedFields,
  };
}

module.exports = { buildAdminOwnerProfileAuditEvent, VALID_AUDIT_FIELDS };

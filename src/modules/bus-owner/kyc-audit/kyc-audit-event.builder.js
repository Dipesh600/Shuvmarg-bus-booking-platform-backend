"use strict";

const { KycAuditError } = require("./kyc-audit.errors");
const { KYC_AUDIT_EVENT, KYC_AUDIT_ACTOR } = require("./kyc-audit.constants");
const { sanitizeInvalidDocumentTypes } = require("./kyc-audit-invalid-documents");

const ALLOWED_STATUSES = Object.freeze(["pending", "approved", "rejected"]);
const ALLOWED_METADATA_KEYS = Object.freeze(["documentCount", "invalidDocumentTypes", "reasonProvided"]);

function validateActorId(actorId) {
  if (!actorId) {
    throw new KycAuditError("KYC_AUDIT_INVALID_ACTOR_ID", "Actor ID is required.", 400);
  }
  const str = String(actorId).trim();
  if (!str) {
    throw new KycAuditError("KYC_AUDIT_INVALID_ACTOR_ID", "Actor ID cannot be empty.", 400);
  }
  return actorId;
}

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new KycAuditError("KYC_AUDIT_INVALID_METADATA", "Metadata must be an object.", 400);
  }

  for (const key of Object.keys(metadata)) {
    if (!ALLOWED_METADATA_KEYS.includes(key)) {
      throw new KycAuditError("KYC_AUDIT_UNSUPPORTED_METADATA", `Unsupported metadata key '${key}'.`, 400);
    }
  }

  const result = {};
  if (metadata.documentCount !== undefined) {
    if (typeof metadata.documentCount !== "number" || metadata.documentCount < 0) {
      throw new KycAuditError("KYC_AUDIT_INVALID_DOCUMENT_COUNT", "documentCount must be a non-negative number.", 400);
    }
    result.documentCount = metadata.documentCount;
  }

  if (metadata.invalidDocumentTypes !== undefined) {
    if (!Array.isArray(metadata.invalidDocumentTypes)) {
      throw new KycAuditError("KYC_AUDIT_INVALID_DOCUMENT_TYPES", "invalidDocumentTypes must be an array.", 400);
    }
    result.invalidDocumentTypes = sanitizeInvalidDocumentTypes(metadata.invalidDocumentTypes);
  }

  if (metadata.reasonProvided !== undefined) {
    if (typeof metadata.reasonProvided !== "boolean") {
      throw new KycAuditError("KYC_AUDIT_INVALID_REASON_PROVIDED", "reasonProvided must be a boolean.", 400);
    }
    result.reasonProvided = metadata.reasonProvided;
  }

  return result;
}

function buildKycAuditEvent(payload) {
  if (!payload || typeof payload !== "object") {
    throw new KycAuditError("KYC_AUDIT_INVALID_PAYLOAD", "Audit event payload must be an object.", 400);
  }

  const { eventType, actorType, actorId, fromStatus, toStatus, occurredAt, metadata } = payload;

  if (!Object.values(KYC_AUDIT_EVENT).includes(eventType)) {
    throw new KycAuditError("KYC_AUDIT_INVALID_EVENT_TYPE", `Invalid eventType '${eventType}'.`, 400);
  }

  if (!Object.values(KYC_AUDIT_ACTOR).includes(actorType)) {
    throw new KycAuditError("KYC_AUDIT_INVALID_ACTOR_TYPE", `Invalid actorType '${actorType}'.`, 400);
  }

  const validatedActorId = validateActorId(actorId);
  const safeFromStatus = fromStatus || null;

  if (safeFromStatus !== null && !ALLOWED_STATUSES.includes(safeFromStatus)) {
    throw new KycAuditError("KYC_AUDIT_INVALID_FROM_STATUS", `Invalid fromStatus '${fromStatus}'.`, 400);
  }

  if (!ALLOWED_STATUSES.includes(toStatus)) {
    throw new KycAuditError("KYC_AUDIT_INVALID_TO_STATUS", `Invalid toStatus '${toStatus}'.`, 400);
  }

  if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
    throw new KycAuditError("KYC_AUDIT_INVALID_TIMESTAMP", "occurredAt must be a valid Date instance.", 400);
  }

  const validatedMetadata = validateMetadata(metadata);

  return {
    eventType,
    actorType,
    actorId: validatedActorId,
    fromStatus: safeFromStatus,
    toStatus,
    occurredAt: new Date(occurredAt.getTime()),
    metadata: validatedMetadata,
  };
}

module.exports = { buildKycAuditEvent };

"use strict";

const LEGAL_DOCUMENT_SLOTS = Object.freeze([
  "fitnessCert",
  "insurance",
  "bluebook",
  "routePermit",
]);

const MEDIA_SLOTS = Object.freeze([
  "fleetImages",
]);

const ALL_DOCUMENT_SLOTS = Object.freeze([
  ...LEGAL_DOCUMENT_SLOTS,
  ...MEDIA_SLOTS,
]);

const PRIVILEGED_BODY_FIELDS = Object.freeze([
  "url",
  "objectKey",
  "storageKey",
  "bucket",
  "mimeType",
  "size",
  "checksum",
  "uploadedBy",
  "actorId",
  "ownerId",
  "approvalStatus",
  "status",
  "documentReviews",
  "approvalAuditHistory",
  "fleetDocumentAuditHistory",
  "createdAt",
  "updatedAt",
]);

const SLOT_METADATA_ALLOW_LIST = Object.freeze({
  fitnessCert: Object.freeze(["validTill", "changeReason"]),
  insurance: Object.freeze(["policyNumber", "validTill", "changeReason"]),
  bluebook: Object.freeze(["changeReason"]),
  routePermit: Object.freeze(["validTill", "changeReason"]),
  fleetImages: Object.freeze(["changeReason"]),
});

const IMAGE_COLLECTION_LIMITS = Object.freeze({
  MIN_COUNT: 1,
  MAX_COUNT: 6,
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
});

const LEGAL_FILE_LIMITS = Object.freeze({
  MAX_FILE_SIZE_BYTES: 8 * 1024 * 1024,
});

module.exports = {
  LEGAL_DOCUMENT_SLOTS,
  MEDIA_SLOTS,
  ALL_DOCUMENT_SLOTS,
  PRIVILEGED_BODY_FIELDS,
  SLOT_METADATA_ALLOW_LIST,
  IMAGE_COLLECTION_LIMITS,
  LEGAL_FILE_LIMITS,
};

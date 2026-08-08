"use strict";

const {
  KYC_AUDIT_EVENT,
  KYC_AUDIT_ACTOR,
  ALLOWED_INVALID_DOC_TYPES,
} = require("./kyc-audit.constants");
const { KycAuditError } = require("./kyc-audit.errors");
const { buildKycAuditEvent } = require("./kyc-audit-event.builder");
const { countValidatedKycFiles } = require("./kyc-audit-document-count");
const {
  hasStoredDocument,
  sanitizeInvalidDocumentTypes,
  collectInvalidKycDocumentTypes,
} = require("./kyc-audit-invalid-documents");

module.exports = {
  KYC_AUDIT_EVENT,
  KYC_AUDIT_ACTOR,
  ALLOWED_INVALID_DOC_TYPES,
  KycAuditError,
  buildKycAuditEvent,
  countValidatedKycFiles,
  hasStoredDocument,
  sanitizeInvalidDocumentTypes,
  collectInvalidKycDocumentTypes,
};

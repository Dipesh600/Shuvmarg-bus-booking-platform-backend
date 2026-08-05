"use strict";

const API_CONTRACT_VERSION = "2026-08-05";

const {
  OWNER_VERIFICATION_STATUS,
  OWNER_VERIFICATION_VALUES,
  OWNER_VERIFICATION_LABELS,
  isOwnerVerificationStatus,
  getOwnerVerificationLabel,
} = require("./status/owner-verification.status");

const {
  FLEET_APPROVAL_STATUS,
  FLEET_APPROVAL_VALUES,
  FLEET_APPROVAL_LABELS,
  isFleetApprovalStatus,
  getFleetApprovalLabel,
} = require("./status/fleet-approval.status");

const {
  FLEET_OPERATIONAL_STATUS,
  FLEET_OPERATIONAL_VALUES,
  FLEET_OPERATIONAL_LABELS,
  isFleetOperationalStatus,
  getFleetOperationalLabel,
} = require("./status/fleet-operational.status");

const {
  DOCUMENT_REVIEW_STATUS,
  DOCUMENT_REVIEW_VALUES,
  DOCUMENT_REVIEW_LABELS,
  isDocumentReviewStatus,
  getDocumentReviewLabel,
} = require("./status/document-review.status");

const {
  KYC_DOCUMENT_STATE,
  KYC_DOCUMENT_STATE_VALUES,
  KYC_DOCUMENT_STATE_LABELS,
  deriveKycDocumentState,
  isKycDocumentState,
  getKycDocumentStateLabel,
} = require("./status/kyc-document-state");

const {
  getPublicStatusMetadata,
} = require("./status/common-status.helpers");

const { API_ERROR_CODES } = require("./errors/api-error-codes");
const { API_ERROR_REGISTRY, getApiErrorDefinition } = require("./errors/registry");
const { ApiError } = require("./errors/api-error");
const { mapApiError, buildCanonicalPayload } = require("./errors/api-error.mapper");

module.exports = {
  API_CONTRACT_VERSION,
  OWNER_VERIFICATION_STATUS,
  OWNER_VERIFICATION_VALUES,
  OWNER_VERIFICATION_LABELS,
  isOwnerVerificationStatus,
  getOwnerVerificationLabel,
  FLEET_APPROVAL_STATUS,
  FLEET_APPROVAL_VALUES,
  FLEET_APPROVAL_LABELS,
  isFleetApprovalStatus,
  getFleetApprovalLabel,
  FLEET_OPERATIONAL_STATUS,
  FLEET_OPERATIONAL_VALUES,
  FLEET_OPERATIONAL_LABELS,
  isFleetOperationalStatus,
  getFleetOperationalLabel,
  DOCUMENT_REVIEW_STATUS,
  DOCUMENT_REVIEW_VALUES,
  DOCUMENT_REVIEW_LABELS,
  isDocumentReviewStatus,
  getDocumentReviewLabel,
  KYC_DOCUMENT_STATE,
  KYC_DOCUMENT_STATE_VALUES,
  KYC_DOCUMENT_STATE_LABELS,
  deriveKycDocumentState,
  isKycDocumentState,
  getKycDocumentStateLabel,
  getPublicStatusMetadata,
  API_ERROR_CODES,
  API_ERROR_REGISTRY,
  getApiErrorDefinition,
  ApiError,
  mapApiError,
  buildCanonicalPayload,
};

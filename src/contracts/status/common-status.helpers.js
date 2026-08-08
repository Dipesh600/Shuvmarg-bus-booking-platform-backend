"use strict";

const {
  OWNER_VERIFICATION_STATUS,
  OWNER_VERIFICATION_LABELS,
} = require("./owner-verification.status");
const {
  FLEET_APPROVAL_STATUS,
  FLEET_APPROVAL_LABELS,
} = require("./fleet-approval.status");
const {
  FLEET_OPERATIONAL_STATUS,
  FLEET_OPERATIONAL_LABELS,
} = require("./fleet-operational.status");
const {
  DOCUMENT_REVIEW_STATUS,
  DOCUMENT_REVIEW_LABELS,
} = require("./document-review.status");
const {
  KYC_DOCUMENT_STATE,
  KYC_DOCUMENT_STATE_LABELS,
} = require("./kyc-document-state");

function mapStatusList(statusEnum, labelMap) {
  return Object.values(statusEnum).map((value) => ({
    value,
    label: labelMap[value] || value,
  }));
}

function getPublicStatusMetadata() {
  return Object.freeze({
    ownerVerification: Object.freeze(
      mapStatusList(OWNER_VERIFICATION_STATUS, OWNER_VERIFICATION_LABELS)
    ),
    fleetApproval: Object.freeze(
      mapStatusList(FLEET_APPROVAL_STATUS, FLEET_APPROVAL_LABELS)
    ),
    fleetOperational: Object.freeze(
      mapStatusList(FLEET_OPERATIONAL_STATUS, FLEET_OPERATIONAL_LABELS)
    ),
    fleetDocumentReview: Object.freeze(
      mapStatusList(DOCUMENT_REVIEW_STATUS, DOCUMENT_REVIEW_LABELS)
    ),
    kycDocumentState: Object.freeze(
      mapStatusList(KYC_DOCUMENT_STATE, KYC_DOCUMENT_STATE_LABELS)
    ),
  });
}

module.exports = {
  getPublicStatusMetadata,
};

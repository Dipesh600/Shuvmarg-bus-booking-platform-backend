"use strict";

const KYC_DOCUMENT_STATE = Object.freeze({
  MISSING: "missing",
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
  REJECTED: "rejected",
});

const KYC_DOCUMENT_STATE_VALUES = Object.freeze(
  Object.values(KYC_DOCUMENT_STATE)
);

const KYC_DOCUMENT_STATE_LABELS = Object.freeze({
  [KYC_DOCUMENT_STATE.MISSING]: "Missing Evidence",
  [KYC_DOCUMENT_STATE.UNVERIFIED]: "Pending Review",
  [KYC_DOCUMENT_STATE.VERIFIED]: "Verified",
  [KYC_DOCUMENT_STATE.REJECTED]: "Rejected",
});

function deriveKycDocumentState({ present, verified, rejectionReason } = {}) {
  if (!present) return KYC_DOCUMENT_STATE.MISSING;
  if (rejectionReason) return KYC_DOCUMENT_STATE.REJECTED;
  if (verified) return KYC_DOCUMENT_STATE.VERIFIED;
  return KYC_DOCUMENT_STATE.UNVERIFIED;
}

function isKycDocumentState(value) {
  return typeof value === "string" && KYC_DOCUMENT_STATE_VALUES.includes(value);
}

function getKycDocumentStateLabel(value) {
  if (!isKycDocumentState(value)) return null;
  return KYC_DOCUMENT_STATE_LABELS[value] || null;
}

module.exports = {
  KYC_DOCUMENT_STATE,
  KYC_DOCUMENT_STATE_VALUES,
  KYC_DOCUMENT_STATE_LABELS,
  deriveKycDocumentState,
  isKycDocumentState,
  getKycDocumentStateLabel,
};

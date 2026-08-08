"use strict";

const OWNER_VERIFICATION_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

const OWNER_VERIFICATION_VALUES = Object.freeze(
  Object.values(OWNER_VERIFICATION_STATUS)
);

const OWNER_VERIFICATION_LABELS = Object.freeze({
  [OWNER_VERIFICATION_STATUS.PENDING]: "Pending Review",
  [OWNER_VERIFICATION_STATUS.APPROVED]: "Approved",
  [OWNER_VERIFICATION_STATUS.REJECTED]: "Rejected",
});

function isOwnerVerificationStatus(value) {
  return typeof value === "string" && OWNER_VERIFICATION_VALUES.includes(value);
}

function getOwnerVerificationLabel(value) {
  if (!isOwnerVerificationStatus(value)) return null;
  return OWNER_VERIFICATION_LABELS[value] || null;
}

module.exports = {
  OWNER_VERIFICATION_STATUS,
  OWNER_VERIFICATION_VALUES,
  OWNER_VERIFICATION_LABELS,
  isOwnerVerificationStatus,
  getOwnerVerificationLabel,
};

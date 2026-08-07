"use strict";

const FLEET_APPROVAL_STATUS = Object.freeze({
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const FLEET_APPROVAL_VALUES = Object.freeze(
  Object.values(FLEET_APPROVAL_STATUS)
);

const FLEET_APPROVAL_LABELS = Object.freeze({
  [FLEET_APPROVAL_STATUS.DRAFT]: "Draft",
  [FLEET_APPROVAL_STATUS.PENDING]: "Pending Review",
  [FLEET_APPROVAL_STATUS.APPROVED]: "Approved",
  [FLEET_APPROVAL_STATUS.REJECTED]: "Rejected",
});

function isFleetApprovalStatus(value) {
  return typeof value === "string" && FLEET_APPROVAL_VALUES.includes(value);
}

function getFleetApprovalLabel(value) {
  if (!isFleetApprovalStatus(value)) return null;
  return FLEET_APPROVAL_LABELS[value] || null;
}

module.exports = {
  FLEET_APPROVAL_STATUS,
  FLEET_APPROVAL_VALUES,
  FLEET_APPROVAL_LABELS,
  isFleetApprovalStatus,
  getFleetApprovalLabel,
};

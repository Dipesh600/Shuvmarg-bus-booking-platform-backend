"use strict";

const KYC_AUDIT_EVENT = Object.freeze({
  SUBMITTED: "KYC_SUBMITTED",
  RESUBMITTED: "KYC_RESUBMITTED",
  APPROVED: "KYC_APPROVED",
  REJECTED: "KYC_REJECTED",
});

const KYC_AUDIT_ACTOR = Object.freeze({
  BUS_OWNER: "BUS_OWNER",
  ADMIN: "ADMIN",
});

const ALLOWED_INVALID_DOC_TYPES = Object.freeze([
  "companyRegistration",
  "ownerIdentity",
  "taxRegistration",
]);

module.exports = {
  KYC_AUDIT_EVENT,
  KYC_AUDIT_ACTOR,
  ALLOWED_INVALID_DOC_TYPES,
};

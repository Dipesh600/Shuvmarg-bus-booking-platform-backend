"use strict";

const { busOwnerKycAuditEventSchema } = require("./bus-owner-kyc-audit.schema");
const adminOwnerProfileAuditSchema = require("./admin-owner-profile-audit.schema");

module.exports = {
  kycAuditHistory: {
    type: [busOwnerKycAuditEventSchema],
    default: [],
  },
  adminProfileAuditHistory: {
    type: [adminOwnerProfileAuditSchema],
    default: [],
    select: false,
  },
};

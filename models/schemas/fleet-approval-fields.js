"use strict";

const mongoose = require("mongoose");
const {
  FLEET_OPERATIONAL_VALUES,
  FLEET_APPROVAL_VALUES,
} = require("../../src/contracts");
const fleetApprovalAuditSchema = require("./fleet-approval-audit.schema");

const fleetApprovalFields = {
  status: {
    type: String,
    enum: FLEET_OPERATIONAL_VALUES,
    default: "INACTIVE",
  },

  approvalStatus: {
    type: String,
    enum: FLEET_APPROVAL_VALUES,
    default: "PENDING",
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    default: null,
  },

  approvedAt: {
    type: Date,
    default: null,
  },

  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    default: null,
  },

  rejectedAt: {
    type: Date,
    default: null,
  },

  rejectionReason: {
    type: String,
    default: null,
  },

  approvalAuditHistory: {
    type: [fleetApprovalAuditSchema],
    default: [],
    select: false,
  },

  fleetDocumentAuditHistory: {
    type: [require("./fleet-document-audit.schema")],
    default: [],
    select: false,
  },
};

module.exports = fleetApprovalFields;

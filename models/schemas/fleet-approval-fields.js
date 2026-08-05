"use strict";

const mongoose = require("mongoose");
const fleetApprovalAuditSchema = require("./fleet-approval-audit.schema");

const fleetApprovalFields = {
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
    default: "INACTIVE",
  },

  approvalStatus: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
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

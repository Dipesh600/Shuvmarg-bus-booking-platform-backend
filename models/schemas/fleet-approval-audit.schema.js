"use strict";

const mongoose = require("mongoose");

const fleetApprovalAuditSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["FLEET_APPROVED", "FLEET_REJECTED"],
      required: true,
    },
    actorType: {
      type: String,
      enum: ["ADMIN"],
      required: true,
      default: "ADMIN",
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fromStatus: {
      type: String,
      enum: ["PENDING"],
      required: true,
      default: "PENDING",
    },
    toStatus: {
      type: String,
      enum: ["APPROVED", "REJECTED"],
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    metadata: {
      rejectionReason: {
        type: String,
        maxlength: 500,
      },
    },
  },
  { _id: true, timestamps: false }
);

module.exports = fleetApprovalAuditSchema;

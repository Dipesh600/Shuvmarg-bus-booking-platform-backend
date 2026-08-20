"use strict";

const mongoose = require("mongoose");

const fleetApprovalAuditSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["FLEET_APPROVED", "FLEET_REJECTED", "FLEET_RESUBMITTED", "FLEET_SUBMITTED"],
      required: true,
      validate: {
        validator: function (val) {
          if (val === "FLEET_APPROVED") {
            return this.actorType === "ADMIN" && this.fromStatus === "PENDING" && this.toStatus === "APPROVED";
          }
          if (val === "FLEET_REJECTED") {
            return this.actorType === "ADMIN" && this.fromStatus === "PENDING" && this.toStatus === "REJECTED";
          }
          if (val === "FLEET_RESUBMITTED") {
            return this.actorType === "BUS_OWNER" && this.fromStatus === "REJECTED" && this.toStatus === "PENDING";
          }
          if (val === "FLEET_SUBMITTED") {
            return this.actorType === "BUS_OWNER" && this.fromStatus === "DRAFT" && this.toStatus === "PENDING";
          }
          return false;
        },
        message: (props) => `Invalid audit event combination for eventType '${props.value}'.`,
      },
    },
    actorType: {
      type: String,
      enum: ["ADMIN", "BUS_OWNER"],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fromStatus: {
      type: String,
      enum: ["PENDING", "REJECTED", "DRAFT"],
      required: true,
    },
    toStatus: {
      type: String,
      enum: ["APPROVED", "REJECTED", "PENDING"],
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

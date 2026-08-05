"use strict";

const mongoose = require("mongoose");

const fleetApprovalAuditSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["FLEET_APPROVED", "FLEET_REJECTED", "FLEET_RESUBMITTED"],
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
            return (this.actorType === "BUS_OWNER" || this.actorType === "ADMIN") && this.fromStatus === "REJECTED" && this.toStatus === "PENDING";
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
      enum: ["PENDING", "REJECTED"],
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

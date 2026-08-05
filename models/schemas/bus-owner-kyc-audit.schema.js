"use strict";

const mongoose = require("mongoose");

const busOwnerKycAuditEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["KYC_SUBMITTED", "KYC_RESUBMITTED", "KYC_APPROVED", "KYC_REJECTED"],
      required: true,
    },
    actorType: {
      type: String,
      enum: ["BUS_OWNER", "ADMIN"],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fromStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: null,
    },
    toStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    metadata: {
      documentCount: {
        type: Number,
        min: 0,
        default: null,
      },
      invalidDocumentTypes: {
        type: [String],
        default: undefined,
      },
      reasonProvided: {
        type: Boolean,
        default: false,
      },
    },
  },
  { _id: true, id: false }
);

module.exports = { busOwnerKycAuditEventSchema };

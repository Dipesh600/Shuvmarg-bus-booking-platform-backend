"use strict";

const mongoose = require("mongoose");

const fleetDocumentAuditSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: [
        "FLEET_DOCUMENT_UPLOADED",
        "FLEET_DOCUMENT_REPLACED",
        "FLEET_DOCUMENT_RESUBMITTED",
        "FLEET_IMAGES_UPDATED",
      ],
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
    documentSlot: {
      type: String,
      enum: [
        "fleetImages",
        "fitnessCert",
        "insurance",
        "bluebook",
        "routePermit",
      ],
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    previousFleetApprovalStatus: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      required: true,
    },
    resultingFleetApprovalStatus: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
      required: true,
    },
    action: {
      type: String,
      enum: ["UPLOADED", "REPLACED", "RESUBMITTED"],
      required: true,
    },
    reason: {
      type: String,
      maxlength: 500,
      default: null,
    },
  },
  { _id: true, timestamps: false }
);

module.exports = fleetDocumentAuditSchema;

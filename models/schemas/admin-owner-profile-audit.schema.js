"use strict";

const mongoose = require("mongoose");

const adminOwnerProfileAuditSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["ADMIN_PROFILE_UPDATED"],
      required: true,
      default: "ADMIN_PROFILE_UPDATED",
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
    occurredAt: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    ownerVerificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
    },
    changedFields: [
      {
        type: String,
        enum: [
          "name",
          "address",
          "email",
          "phone",
          "companyName",
          "panNumber",
          "registrationNumber",
          "bankName",
          "accountNumber",
          "accountHolderName",
          "branchName",
          "swiftCode",
        ],
        required: true,
      },
    ],
  },
  { _id: true, id: false, timestamps: false }
);

module.exports = adminOwnerProfileAuditSchema;

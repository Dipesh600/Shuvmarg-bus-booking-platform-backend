"use strict";

const mongoose = require("mongoose");

const fleetDocumentReviewSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false, timestamps: false }
);

module.exports = fleetDocumentReviewSchema;

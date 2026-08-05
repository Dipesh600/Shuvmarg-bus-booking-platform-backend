"use strict";

const mongoose = require("mongoose");
const { DOCUMENT_REVIEW_VALUES } = require("../../src/contracts");

const fleetDocumentReviewSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: DOCUMENT_REVIEW_VALUES,
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

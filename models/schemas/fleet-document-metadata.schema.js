"use strict";

const mongoose = require("mongoose");

const fleetDocumentMetadataSchema = new mongoose.Schema(
  {
    objectKey: {
      type: String,
      default: null,
      select: false,
    },
    mimeType: {
      type: String,
      default: null,
      select: false,
    },
    size: {
      type: Number,
      default: null,
      select: false,
    },
    uploadedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false, timestamps: false }
);

module.exports = fleetDocumentMetadataSchema;

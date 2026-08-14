"use strict";

const mongoose = require("mongoose");
const fleetDocumentReviewSchema = require("./fleet-document-review.schema");

const fleetImageItemSchema = new mongoose.Schema(
  {
    imageId: { type: String, required: true },
    view: {
      type: String,
      enum: ["FRONT", "SIDE", "BACK", "INSIDE"],
      default: null,
    },
    objectKey: { type: String, required: true, select: false },
    mimeType: { type: String, required: true, select: false },
    size: { type: Number, required: true, select: false },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false, timestamps: false }
);

const legalDocFieldBase = {
  url: { type: String, default: null },
  objectKey: { type: String, default: null, select: false },
  mimeType: { type: String, default: null, select: false },
  size: { type: Number, default: null, select: false },
  uploadedAt: { type: Date, default: null },
};

const fleetDocumentFields = {
  fleetImages: {
    type: [fleetImageItemSchema],
    default: [],
    validate: {
      validator: (images) => {
        if (!images || images.length === 0) return true;
        const views = new Set(images.map((image) => image.view));
        return images.length === 4 && views.size === 4 &&
          ["FRONT", "SIDE", "BACK", "INSIDE"].every((view) => views.has(view));
      },
      message: "Fleet photos must contain exactly one front, side, back, and inside image.",
    },
  },

  fleetDocuments: {
    fitnessCert: {
      ...legalDocFieldBase,
      validTill: { type: Date, default: null },
    },
    insurance: {
      ...legalDocFieldBase,
      policyNumber: { type: String, default: null },
      validTill: { type: Date, default: null },
    },
    bluebook: {
      ...legalDocFieldBase,
    },
    routePermit: {
      ...legalDocFieldBase,
      validTill: { type: Date, default: null },
    },
  },

  documentReviews: {
    fleetImages: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    fitnessCert: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    insurance: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    bluebook: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
    routePermit: { type: fleetDocumentReviewSchema, default: () => ({ status: "pending", reason: null }) },
  },
};

module.exports = fleetDocumentFields;

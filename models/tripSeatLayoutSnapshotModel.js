"use strict";

const mongoose = require("mongoose");
const { makeAppendOnly } = require("./schemas/append-only.guard");

const placeStateSchema = new mongoose.Schema({
  elementId: { type: String, required: true },
  state: { type: String, enum: ["OPEN", "WITHDRAWN"], required: true },
}, { _id: false, strict: "throw" });

const placeFareSchema = new mongoose.Schema({
  elementId: { type: String, required: true },
  fare: { type: Number, required: true, min: 0 },
}, { _id: false, strict: "throw" });

const tripSeatLayoutSnapshotSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, unique: true },
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutTemplate", required: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", required: true },
  sourceAssignmentVersion: { type: Number, required: true, min: 1, immutable: true },
  physicalFingerprint: { type: String, required: true, immutable: true },
  layout: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  placeStates: { type: [placeStateSchema], default: [], immutable: true },
  pricing: {
    currency: { type: String, enum: ["NPR"], default: "NPR", immutable: true },
    status: { type: String, enum: ["PRICED", "UNPRICED"], required: true, immutable: true },
    defaultFare: { type: Number, default: null, min: 0, immutable: true },
    overrides: { type: [placeFareSchema], default: [], immutable: true },
  },
  capturedAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { timestamps: true, strict: "throw" });

tripSeatLayoutSnapshotSchema.pre("validate", function validatePricing(next) {
  if (this.pricing?.status === "PRICED" && !Number.isFinite(this.pricing.defaultFare)) {
    return next(new Error("Priced trip seat layouts require a default fare."));
  }
  if (this.pricing?.status === "UNPRICED" && this.pricing.defaultFare !== null) {
    return next(new Error("Unpriced trip seat layouts cannot contain a default fare."));
  }
  return next();
});

tripSeatLayoutSnapshotSchema.index({ revisionId: 1, createdAt: -1 });
makeAppendOnly(tripSeatLayoutSnapshotSchema, "Trip seat-layout snapshot");

module.exports = mongoose.model("TripSeatLayoutSnapshot", tripSeatLayoutSnapshotSchema);

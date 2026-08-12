"use strict";

const mongoose = require("mongoose");
const { validateSeatLayout } = require("../src/domain/seat-layout/seat-layout.validation");

const schema = new mongoose.Schema({
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  fromVersionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutVersion", required: true, immutable: true,
  },
  toVersionId: { type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutVersion", default: null },
  proposedSeatConfig: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  classification: {
    type: String,
    enum: ["ADDITION_ONLY", "WITHDRAWAL_OR_MODIFICATION"],
    required: true,
    immutable: true,
  },
  addedSeatIds: { type: [String], default: [] },
  removedSeatIds: { type: [String], default: [] },
  modifiedSeatIds: { type: [String], default: [] },
  removedSeatLabels: { type: [String], default: [] },
  effectiveAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ["PENDING_REVIEW", "APPLYING", "REJECTED", "SCHEDULED", "APPLIED"],
    required: true,
    index: true,
  },
  reason: { type: String, trim: true, maxlength: 500, default: null },
  requestedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: null },
}, { timestamps: true });

schema.index(
  { fleetId: 1 },
  {
    unique: true,
    name: "one_open_layout_revision_per_fleet",
    partialFilterExpression: { status: { $in: ["PENDING_REVIEW", "APPLYING", "SCHEDULED"] } },
  }
);

schema.pre("validate", function validateProposedLayout() {
  this.proposedSeatConfig = validateSeatLayout(this.proposedSeatConfig).seatConfig;
});

module.exports = mongoose.models.FleetSeatLayoutRevision ||
  mongoose.model("FleetSeatLayoutRevision", schema);

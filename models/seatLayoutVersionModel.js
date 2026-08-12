"use strict";

const crypto = require("node:crypto");
const mongoose = require("mongoose");
const {
  validateSeatLayout,
  seatLayoutFingerprint,
} = require("../src/domain/seat-layout/seat-layout.validation");

const schema = new mongoose.Schema({
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SeatTemplate",
    required: true,
    immutable: true,
    index: true,
  },
  versionNumber: { type: Number, required: true, min: 1, immutable: true },
  sourceVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SeatLayoutVersion",
    default: null,
    immutable: true,
  },
  seatConfig: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  totalSeats: { type: Number, required: true, min: 1, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  createdById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    default: null,
    immutable: true,
  },
  changeNote: { type: String, trim: true, maxlength: 500, default: null, immutable: true },
}, { timestamps: true });

schema.index({ templateId: 1, versionNumber: 1 }, { unique: true });
schema.index({ templateId: 1, fingerprint: 1 }, { unique: true });

schema.pre("validate", function validateImmutableVersion() {
  const layout = validateSeatLayout(this.seatConfig);
  this.seatConfig = layout.seatConfig;
  this.totalSeats = layout.totalSeats;
  this.fingerprint = crypto.createHash("sha256")
    .update(seatLayoutFingerprint(layout.seatConfig))
    .digest("hex");
});

function rejectVersionMutation() {
  const error = new Error("Seat layout versions are immutable.");
  error.code = "SEAT_LAYOUT_VERSION_IMMUTABLE";
  error.statusCode = 409;
  throw error;
}

schema.pre("updateOne", rejectVersionMutation);
schema.pre("updateMany", rejectVersionMutation);
schema.pre("findOneAndUpdate", rejectVersionMutation);
schema.pre("replaceOne", rejectVersionMutation);
schema.pre("deleteOne", { document: false, query: true }, rejectVersionMutation);
schema.pre("deleteMany", rejectVersionMutation);
schema.pre("findOneAndDelete", rejectVersionMutation);

module.exports = mongoose.models.SeatLayoutVersion ||
  mongoose.model("SeatLayoutVersion", schema);

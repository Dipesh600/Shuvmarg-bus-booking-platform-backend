"use strict";

const mongoose = require("mongoose");
const { ACTOR_TYPES } = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");
const { preventDeletes } = require("./schemas/append-only.guard");

const fleetSeatLayoutChangeRequestSchema = new mongoose.Schema({
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, index: true },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId, ref: "FleetSeatLayoutAssignment", required: true,
  },
  fromRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", required: true,
  },
  proposedRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", required: true,
  },
  status: {
    type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    default: "PENDING", index: true,
  },
  requestedByType: { type: String, enum: ACTOR_TYPES, required: true },
  requestedById: { type: mongoose.Schema.Types.ObjectId, required: true },
  requestedAt: { type: Date, default: Date.now, required: true },
  reviewedById: { type: mongoose.Schema.Types.ObjectId, default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 500, default: null },
}, { timestamps: true, strict: "throw" });

fleetSeatLayoutChangeRequestSchema.index(
  { fleetId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);
preventDeletes(fleetSeatLayoutChangeRequestSchema, "Fleet seat-layout change request");

module.exports = mongoose.model("FleetSeatLayoutChangeRequest", fleetSeatLayoutChangeRequestSchema);

"use strict";

const mongoose = require("mongoose");
const { ACTOR_TYPES } = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");
const { preventDeletes } = require("./schemas/append-only.guard");

const fleetSeatLayoutAssignmentSchema = new mongoose.Schema({
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, unique: true },
  templateId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutTemplate", required: true,
  },
  activeRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", required: true,
  },
  assignmentVersion: { type: Number, min: 1, default: 1 },
  assignedAt: { type: Date, required: true, default: Date.now },
  assignedByType: { type: String, enum: ACTOR_TYPES, required: true },
  assignedById: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: "throw" });

fleetSeatLayoutAssignmentSchema.index({ templateId: 1, activeRevisionId: 1 });
preventDeletes(fleetSeatLayoutAssignmentSchema, "Fleet seat-layout assignment");

module.exports = mongoose.model("FleetSeatLayoutAssignment", fleetSeatLayoutAssignmentSchema);

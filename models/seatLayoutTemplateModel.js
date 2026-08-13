"use strict";

const mongoose = require("mongoose");
const {
  TEMPLATE_SCOPES, TEMPLATE_STATUSES, ACTOR_TYPES,
} = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");
const { preventDeletes } = require("./schemas/append-only.guard");

const seatLayoutTemplateSchema = new mongoose.Schema({
  templateCode: { type: String, required: true, trim: true, uppercase: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  scope: { type: String, enum: TEMPLATE_SCOPES, required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  sourceTemplateId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutTemplate", default: null,
  },
  vehicleCategory: {
    type: String, enum: ["BUS", "MINIBUS", "HIACE"], required: true,
  },
  status: { type: String, enum: TEMPLATE_STATUSES, default: "ACTIVE", index: true },
  currentPublishedRevisionId: {
    type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", default: null,
  },
  revisionCounter: { type: Number, default: 0, min: 0, select: false },
  createdByType: { type: String, enum: ACTOR_TYPES, required: true },
  createdById: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: "throw" });

seatLayoutTemplateSchema.pre("validate", function validateOwnership(next) {
  if (this.scope === "PLATFORM" && this.ownerId) {
    return next(new Error("Platform seat-layout templates cannot have an operator owner."));
  }
  if (this.scope === "OPERATOR" && !this.ownerId) {
    return next(new Error("Operator seat-layout templates require an owner."));
  }
  return next();
});

seatLayoutTemplateSchema.index({ ownerId: 1, status: 1, updatedAt: -1 });
seatLayoutTemplateSchema.index({ sourceTemplateId: 1 });
preventDeletes(seatLayoutTemplateSchema, "Seat-layout template");

module.exports = mongoose.model("SeatLayoutTemplate", seatLayoutTemplateSchema);

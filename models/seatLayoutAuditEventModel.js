"use strict";

const mongoose = require("mongoose");
const { preventDeletes } = require("./schemas/append-only.guard");
const { ACTOR_TYPES } = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");

const schema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      "TEMPLATE_CREATED", "TEMPLATE_ADOPTED", "REVISION_CREATED",
      "REVISION_SUBMITTED", "REVISION_PUBLISHED", "INITIAL_FLEET_LAYOUT_CREATED",
    ],
    required: true,
    index: true,
  },
  actorType: { type: String, enum: ACTOR_TYPES, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutTemplate", default: null, index: true },
  revisionId: { type: mongoose.Schema.Types.ObjectId, ref: "SeatLayoutRevision", default: null, index: true },
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Fleet", default: null, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, strict: "throw" });

schema.index({ templateId: 1, createdAt: -1 });
schema.index({ fleetId: 1, createdAt: -1 });
preventDeletes(schema, "Seat-layout audit event");

const rejectMutation = function rejectMutation() {
  throw new Error("Seat-layout audit events are append-only.");
};
schema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"], rejectMutation);

module.exports = mongoose.model("SeatLayoutAuditEvent", schema);

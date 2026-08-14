"use strict";

const mongoose = require("mongoose");
const { makeAppendOnly } = require("./schemas/append-only.guard");

const tripSeatLayoutControlEventSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, index: true },
  action: { type: String, enum: ["PLACE_OPENED", "PLACE_WITHDRAWN", "PRICING_CHANGED"], required: true },
  elementId: { type: String, default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  after: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  reason: { type: String, trim: true, maxlength: 300, default: null },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
}, { timestamps: true, strict: "throw" });

makeAppendOnly(tripSeatLayoutControlEventSchema, "Trip seat-layout control event");

module.exports = mongoose.model("TripSeatLayoutControlEvent", tripSeatLayoutControlEventSchema);

"use strict";

const mongoose = require("mongoose");

const stateOverrideSchema = new mongoose.Schema({
  elementId: { type: String, required: true },
  state: { type: String, enum: ["OPEN", "WITHDRAWN"], required: true },
}, { _id: false, strict: "throw" });

const fareOverrideSchema = new mongoose.Schema({
  elementId: { type: String, required: true },
  fare: { type: Number, required: true, min: 0 },
}, { _id: false, strict: "throw" });

const tripSeatLayoutControlSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, unique: true },
  fleetId: { type: mongoose.Schema.Types.ObjectId, ref: "Buse", required: true, index: true },
  version: { type: Number, required: true, min: 1, default: 1 },
  stateOverrides: { type: [stateOverrideSchema], default: [] },
  defaultFareOverride: { type: Number, default: null, min: 0 },
  fareOverrides: { type: [fareOverrideSchema], default: [] },
  updatedById: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: "throw" });

tripSeatLayoutControlSchema.index({ fleetId: 1, updatedAt: -1 });

module.exports = mongoose.model("TripSeatLayoutControl", tripSeatLayoutControlSchema);

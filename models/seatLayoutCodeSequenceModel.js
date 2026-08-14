"use strict";

const mongoose = require("mongoose");
const {
  VEHICLE_CATEGORIES,
} = require("../src/modules/seat-layout-v3-persistence/seat-layout-persistence.constants");

const schema = new mongoose.Schema({
  _id: { type: String, enum: VEHICLE_CATEGORIES, required: true },
  value: { type: Number, min: 0, default: 0, required: true },
}, { versionKey: false, timestamps: false, strict: "throw" });

module.exports = mongoose.model("SeatLayoutCodeSequence", schema);

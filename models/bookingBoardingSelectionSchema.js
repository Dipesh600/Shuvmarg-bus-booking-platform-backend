"use strict";

const mongoose = require("mongoose");

module.exports = new mongoose.Schema({
  sourceType: {
    type: String,
    enum: ["BOARDING_LOCATION", "STOP_FALLBACK", "LEGACY"],
    default: null,
  },
  stopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop", default: null },
  boardingLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BoardingLocation",
    default: null,
  },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OperatorBoardingAssignment",
    default: null,
  },
  name: { type: String, default: null },
  canonicalName: { type: String, default: null },
  stopName: { type: String, default: null },
  landmark: { type: String, default: null },
  address: { type: String, default: null },
  reportingInstructions: { type: String, default: null },
  time: { type: String, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
}, { _id: false });

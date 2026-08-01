"use strict";

const mongoose = require("mongoose");

const operatorBoardingAssignmentSchema = new mongoose.Schema({
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OperatorBrand",
    required: true,
  },
  boardingLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BoardingLocation",
    required: true,
  },
  usage: {
    type: String, enum: ["PICKUP", "DROP", "BOTH"], default: "BOTH",
  },
  displayName: { type: String, trim: true, default: null },
  counterNumber: { type: String, trim: true, default: null },
  contactName: { type: String, trim: true, default: null },
  contactPhone: { type: String, trim: true, default: null },
  reportingInstructions: { type: String, trim: true, default: null },
  status: {
    type: String,
    enum: ["PENDING_REVIEW", "ACTIVE", "INACTIVE"],
    default: "PENDING_REVIEW",
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

operatorBoardingAssignmentSchema.index(
  { brandId: 1, boardingLocationId: 1 },
  { unique: true, name: "operator_boarding_assignment_unique" }
);
operatorBoardingAssignmentSchema.index({ brandId: 1, status: 1 });
operatorBoardingAssignmentSchema.index({ boardingLocationId: 1, status: 1 });

module.exports = mongoose.model(
  "OperatorBoardingAssignment",
  operatorBoardingAssignmentSchema
);

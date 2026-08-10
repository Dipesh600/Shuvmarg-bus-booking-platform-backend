"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  environment: { type: String, required: true, immutable: true },
  status: { type: String, enum: ["PROVISIONING", "COMPLETED"], required: true },
  rootAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    required: true,
    immutable: true,
  },
  enrollmentTokenHash: { type: String, select: false },
  enrollmentExpiresAt: Date,
  completedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model("AdminBootstrapState", schema);

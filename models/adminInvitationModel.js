"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  adminId: { type: String, required: true, uppercase: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"], required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin", required: true },
  targetAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ email: 1, consumedAt: 1 });

module.exports = mongoose.model("AdminInvitation", schema);

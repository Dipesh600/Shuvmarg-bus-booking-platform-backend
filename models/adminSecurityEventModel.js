"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      "ROOT_BOOTSTRAPPED", "MFA_ENROLLMENT_STARTED", "MFA_ENROLLED",
      "ADMIN_INVITED", "ADMIN_ACTIVATED", "ADMIN_SUSPENDED", "ADMIN_REACTIVATED",
      "LOGIN_FAILED", "LOGIN_SUCCEEDED",
      "ACCOUNT_TEMPORARILY_LOCKED", "RECOVERY_CODE_USED",
    ],
    required: true,
  },
  actorAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
  targetAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdmin" },
  outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true },
  ipAddress: String,
  userAgent: String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ action: 1, createdAt: -1 });
schema.index({ targetAdminId: 1, createdAt: -1 });

module.exports = mongoose.model("AdminSecurityEvent", schema);

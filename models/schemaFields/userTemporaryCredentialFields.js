"use strict";

const mongoose = require("mongoose");

module.exports = {
  temporaryCredentialIssuedAt: { type: Date, default: null, select: false },
  temporaryCredentialExpiresAt: { type: Date, default: null, select: false },
  temporaryCredentialVersion: { type: Number, default: 0, select: false },
  temporaryCredentialIssuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuperAdmin",
    default: null,
    select: false,
  },
  accessNotification: {
    status: {
      type: String,
      enum: ["NOT_ATTEMPTED", "DELIVERED", "FAILED"],
      default: "NOT_ATTEMPTED",
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
};

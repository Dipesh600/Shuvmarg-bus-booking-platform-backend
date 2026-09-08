"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  ticketId: { type: String, required: true },
  status: { type: String, enum: ["PENDING", "SENDING", "COMPLETED", "SKIPPED"], default: "PENDING" },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: String,
  leaseExpiresAt: Date,
  attempts: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
module.exports = mongoose.model("BookingNotificationJob", schema);

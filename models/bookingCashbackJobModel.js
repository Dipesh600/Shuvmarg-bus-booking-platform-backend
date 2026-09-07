"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  baseTicketPrice: { type: Number, required: true },
  status: { type: String, enum: ["PENDING", "COMPLETED", "SKIPPED"], default: "PENDING" },
  nextAttemptAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ status: 1, nextAttemptAt: 1 });
module.exports = mongoose.model("BookingCashbackJob", schema);

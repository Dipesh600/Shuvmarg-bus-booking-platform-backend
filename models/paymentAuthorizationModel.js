'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  holdId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tempBookingId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  phone: { type: String, required: true },
  tokenVersion: { type: Number, required: true },
  codeHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  deliveredAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
schema.index({ userId: 1, tempBookingId: 1, createdAt: -1 });
module.exports = mongoose.model('PaymentAuthorization', schema);

"use strict";

const mongoose = require("mongoose");
const { MESSAGE_TYPES, MESSAGE_STATUSES } = require("../src/modules/notifications/outbox/notification-outbox.constants");

const schema = new mongoose.Schema({
  channel: { type: String, enum: ["SMS"], default: "SMS", required: true },
  messageType: { type: String, enum: MESSAGE_TYPES, required: true },
  templateVersion: { type: Number, min: 1, default: 1 },
  idempotencyKey: { type: String, required: true, maxlength: 220 },
  businessReference: { type: String, required: true, maxlength: 180 },
  recipientPhone: { type: String, required: true, select: false },
  recipientMasked: { type: String, required: true, maxlength: 32 },
  body: { type: String, required: true, maxlength: 1000, select: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: "OperatorBrand", default: null, index: true },
  status: { type: String, enum: MESSAGE_STATUSES, default: "PENDING", index: true },
  attempts: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 10, default: 5 },
  nextAttemptAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  leaseToken: { type: String, default: null, select: false },
  leaseExpiresAt: { type: Date, default: null },
  provider: { type: String, default: "SPARROW" },
  providerReference: { type: String, default: null },
  providerAcceptedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
  lastError: {
    category: { type: String, default: null },
    code: { type: String, default: null },
    message: { type: String, default: null, maxlength: 300 },
    at: { type: Date, default: null },
  },
  manualReplay: {
    actorType: { type: String, enum: ["ADMIN", "BUS_OWNER"], default: null },
    actorId: { type: String, default: null, maxlength: 80 },
    reason: { type: String, default: null, maxlength: 300 },
    at: { type: Date, default: null },
    sourceMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "NotificationOutbox", default: null },
  },
}, { timestamps: true });

schema.index({ idempotencyKey: 1 }, { unique: true });
schema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });
schema.index({ businessReference: 1, createdAt: -1 });

module.exports = mongoose.model("NotificationOutbox", schema);

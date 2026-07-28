'use strict';

const mongoose = require('mongoose');

const esewaPaymentAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    holdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SeatHold',
      required: true,
      index: true,
    },
    tempBookingId: { type: String, required: true, unique: true },
    transactionUuid: { type: String, required: true, unique: true },
    productCode: { type: String, required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    gatewayAmount: { type: Number, required: true, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    smMoneyApplied: { type: Number, default: 0, min: 0 },
    confirmationQuote: { type: mongoose.Schema.Types.Mixed, required: true },
    checkoutPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    formFields: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: [
        'INITIATED',
        'VERIFYING',
        'COMPLETED',
        'FAILED',
        'DISPUTED',
      ],
      default: 'INITIATED',
      index: true,
    },
    holdExpiresAt: { type: Date, required: true },
    processingExpiresAt: { type: Date, default: null },
    providerReference: { type: String, default: null },
    failureReason: { type: String, default: null },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    transactionRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
    },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

esewaPaymentAttemptSchema.index({ userId: 1, createdAt: -1 });
esewaPaymentAttemptSchema.index({ status: 1, processingExpiresAt: 1 });

module.exports = mongoose.model(
  'EsewaPaymentAttempt',
  esewaPaymentAttemptSchema
);

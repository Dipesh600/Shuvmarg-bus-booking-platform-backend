const mongoose = require("mongoose");

// Guarantee SuperAdmin model is registered
require("./adminModel.js");

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
            index: true,
        },
        ticketId: {
            type: String,
            default: null,
            index: true,
        },

        // === TRIP CONTEXT (for dispute resolution) ===
        tripId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trip",
            default: null,
            index: true,
        },
        seats: {
            type: [String],
            default: [],
        },

        transactionType: {
            type: String,
            enum: ["BOOKING", "REFUND", "OTHER"],
            default: "BOOKING",
            index: true,
        },
        gateway: {
            type: String,
            required: true,
        },
        paymentMethod: {
            type: String,
            default: null,
        },
        transactionId: {
            type: String,
            required: true,
            index: true,
        },
        originalAmount: {
            type: Number,
            default: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: "NPR",
        },
        status: {
            type: String,
            enum: [
                "PENDING",
                "PAYMENT_RECEIVED",   // eSewa verified, booking not yet created
                "SUCCESS",            // Booking created successfully
                "FAILED",
                "DISPUTED",           // Payment received but booking creation failed
                "REFUNDED",
            ],
            default: "PENDING",
            index: true,
        },
        paidAt: {
            type: Date,
            default: null,
        },
        failureReason: {
            type: String,
            default: null,
        },

        // === DISPUTE RESOLUTION ===
        disputeReason: {
            type: String,
            default: null,
        },
        proofAttachmentKey: {
            type: String,
            default: null,
        },
        refundStatus: {
            type: String,
            enum: ["NONE", "PENDING", "COMPLETED"],
            default: "NONE",
        },
        refundNote: {
            type: String,
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },

        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ bookingId: 1, transactionType: 1, createdAt: -1 });
// Reconciliation cron: find PAYMENT_RECEIVED / DISPUTED transactions efficiently
transactionSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);

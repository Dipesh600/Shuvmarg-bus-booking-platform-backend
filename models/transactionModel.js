
const mongoose = require("mongoose");

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
            enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
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
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ bookingId: 1, transactionType: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);


const mongoose = require("mongoose");

const settlementSchema = new mongoose.Schema(
    {
        // Who is this settlement for
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Which Operator Brand this settlement is for.
        // A single owner with multiple brands gets SEPARATE settlements per brand,
        // each paid to THAT brand's specific bank account at THAT brand's commission rate.
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            required: true,
            index: true,
        },

        // Which trips are included in this settlement
        tripIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Trip",
            required: true,
        }],

        // Financial breakdown
        totalTicketsSold: {
            type: Number,
            required: true,
            min: 0,
        },
        grossAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        platformCommission: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
        commissionRate: {
            type: Number,
            default: 10,    // Platform takes 10% by default
            min: 0,
            max: 100,
        },
        netPayableAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        // Settlement lifecycle
        status: {
            type: String,
            enum: ["pending", "processing", "paid", "received", "disputed"],
            default: "pending",
            index: true,
        },

        // Raised by bus owner or admin
        raisedBy: {
            type: String,
            enum: ["OWNER", "ADMIN"],
            required: true,
        },
        raisedAt: {
            type: Date,
            default: Date.now,
        },

        // Payment proof (uploaded by admin after bank transfer)
        paymentProof: {
            type: String,   // URL to bank receipt / screenshot
            default: null,
        },
        paymentMethod: {
            type: String,
            enum: ["BANK_TRANSFER", "ONLINE", "CASH", "CHEQUE"],
            default: null,
        },
        paidAt: {
            type: Date,
            default: null,
        },
        paidBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SuperAdmin",
            default: null,
        },

        // Confirmation by bus owner
        receivedAt: {
            type: Date,
            default: null,
        },
        receivedConfirmedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        remarks: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for common queries
settlementSchema.index({ ownerId: 1, status: 1 });
settlementSchema.index({ brandId: 1, status: 1 });
settlementSchema.index({ status: 1, raisedAt: -1 });
settlementSchema.index({ ownerId: 1, createdAt: -1 });
settlementSchema.index({ brandId: 1, createdAt: -1 });

module.exports = mongoose.model("Settlement", settlementSchema);

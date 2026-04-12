const mongoose = require("mongoose");

const refundDetailsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        label: {
            type: String, // e.g., "My eSewa", "Business Bank"
            default: "Primary Payout",
        },
        accountType: {
            type: String,
            enum: ["esewa", "khalti", "bank", "ime_pay", "connect_ips"],
            required: true,
        },
        accountName: {
            type: String,
            required: true, // Name as per bank/wallet records
        },
        accountNumber: {
            type: String, // eSewa ID, Khalti number, or bank account number
            required: true,
        },
        bankName: {
            type: String,
            default: null, // Only relevant for accountType: "bank"
        },
        bankBranch: {
            type: String,
            default: null, // Only relevant for accountType: "bank"
        },
        isDefault: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RefundDetails", refundDetailsSchema);

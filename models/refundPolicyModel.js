const mongoose = require("mongoose");

const refundPolicySchema = new mongoose.Schema(
    {
        policyName: {
            type: String,
            required: true,
            trim: true,
        },
        refundPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        deductionPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        description: {
            type: String,
            required: true, // "Full refund", "Partial refund", etc.
        },
        minHours: {
            type: Number,
            default: 0,
        },
        maxHours: {
            type: Number,
            default: null, // null means infinity/no upper limit
        },
        color: {
            type: String, // Hex code or generic color name for visual rep
            default: "#000000",
        },
        isActive: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("RefundPolicy", refundPolicySchema);

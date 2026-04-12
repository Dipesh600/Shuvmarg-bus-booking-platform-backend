const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "User ID is required"]
    },
    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        required: [true, "Coupon ID is required"]
    },
    couponCode: {
        type: String,
        required: [true, "Coupon code is required"],
        uppercase: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
        required: [true, "Booking ID is required"]
    },
    originalAmount: {
        type: Number,
        required: [true, "Original amount is required"],
        min: [0, "Original amount must be positive"]
    },
    discountAmount: {
        type: Number,
        required: [true, "Discount amount is required"],
        min: [0, "Discount amount must be positive"]
    },
    finalAmount: {
        type: Number,
        required: [true, "Final amount is required"],
        min: [0, "Final amount must be positive"]
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: [true, "Discount type is required"]
    },
    discountValue: {
        type: Number,
        required: [true, "Discount value is required"]
    },
    usageDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['applied', 'refunded', 'cancelled'],
        default: 'applied'
    }
}, { 
    timestamps: true 
});

// Compound index to ensure one user can't use same coupon multiple times if per user limit is 1
couponUsageSchema.index({ userId: 1, couponId: 1 });

// Index for better query performance
couponUsageSchema.index({ couponCode: 1 });
couponUsageSchema.index({ bookingId: 1 });
couponUsageSchema.index({ usageDate: 1 });

// Static method to get user's coupon usage count
couponUsageSchema.statics.getUserCouponUsageCount = function(userId, couponId) {
    return this.countDocuments({ 
        userId: userId, 
        couponId: couponId,
        status: 'applied'
    });
};

// Static method to get coupon's total usage count
couponUsageSchema.statics.getCouponTotalUsage = function(couponId) {
    return this.countDocuments({ 
        couponId: couponId,
        status: 'applied'
    });
};

// Method to calculate savings percentage
couponUsageSchema.methods.getSavingsPercentage = function() {
    if (this.originalAmount === 0) return 0;
    return Math.round((this.discountAmount / this.originalAmount) * 100 * 100) / 100;
};

module.exports = mongoose.model("CouponUsage", couponUsageSchema);
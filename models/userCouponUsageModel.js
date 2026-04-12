const mongoose = require("mongoose");

const userCouponUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: [true, "Coupon ID is required"],
    },
    couponCode: {
      type: String,
      required: [true, "Coupon code is required"],
      uppercase: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking ID is required"],
    },
    ticketId: {
      type: String,
      required: [true, "Ticket ID is required"],
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
    discountAmount: {
      type: Number,
      required: [true, "Discount amount is required"],
      min: 0,
    },
    originalAmount: {
      type: Number,
      required: [true, "Original amount is required"],
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: [true, "Final amount is required"],
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "refunded", "cancelled"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for userId and couponId for faster lookups
userCouponUsageSchema.index({ userId: 1, couponId: 1 });

// Index on couponCode for faster lookups
userCouponUsageSchema.index({ couponCode: 1 });

// Index on bookingId for faster lookups
userCouponUsageSchema.index({ bookingId: 1 });

// Static method to check if a user has used a coupon
userCouponUsageSchema.statics.hasUserUsedCoupon = async function (
  userId,
  couponId
) {
  const count = await this.countDocuments({
    userId: userId,
    couponId: couponId,
    status: "active", // Only count active usages, not refunded or cancelled
  });

  return count > 0;
};

// Static method to check how many times a user has used a coupon
userCouponUsageSchema.statics.getUserCouponUsageCount = async function (
  userId,
  couponId
) {
  return this.countDocuments({
    userId: userId,
    couponId: couponId,
    status: "active", // Only count active usages, not refunded or cancelled
  });
};

// Static method to get all coupons used by a user
userCouponUsageSchema.statics.getUserCoupons = async function (userId) {
  return this.find({
    userId: userId,
    status: "active",
  }).populate("couponId", "couponCode title description");
};

// Calculate savings percentage
userCouponUsageSchema.methods.getSavingsPercentage = function () {
  if (this.originalAmount === 0) return 0;
  return (
    Math.round((this.discountAmount / this.originalAmount) * 100 * 100) / 100
  ); // Round to 2 decimal places
};

// Mark a usage as refunded (for when booking is cancelled)
userCouponUsageSchema.methods.markAsRefunded = async function () {
  this.status = "refunded";
  return this.save();
};

// Mark a usage as cancelled
userCouponUsageSchema.methods.markAsCancelled = async function () {
  this.status = "cancelled";
  return this.save();
};

module.exports = mongoose.model("UserCouponUsage", userCouponUsageSchema);

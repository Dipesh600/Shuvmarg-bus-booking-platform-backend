const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },
    seats: [
      {
        type: String,
        required: true,
      },
    ],
    originalAmount: {
      type: Number,
      required: true,
    },
    couponUsed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    couponCode: {
      type: String,
      default: null,
      uppercase: true,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "Discount amount cannot be negative"],
    },
    yatraPointsUsed: {
      type: Number,
      default: 0,
      min: [0, "Yatra points used cannot be negative"],
    },
    yatraPointsDiscount: {
      type: Number,
      default: 0,
      min: [0, "Yatra points discount cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    bookedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["booked", "cancelled", "pending"],
      default: "booked",
    },
    ticketId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// Index for better query performance
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ couponUsed: 1 });
bookingSchema.index({ couponCode: 1 });
bookingSchema.index({ ticketId: 1 });

// Virtual field to check if coupon was used
bookingSchema.virtual("hasCouponDiscount").get(function () {
  return this.couponUsed !== null && this.discountAmount > 0;
});

// Method to calculate savings percentage
bookingSchema.methods.getSavingsPercentage = function () {
  if (this.originalAmount === 0) return 0;
  return (
    Math.round((this.discountAmount / this.originalAmount) * 100 * 100) / 100
  );
};

// Method to get effective discount rate
bookingSchema.methods.getEffectiveDiscountRate = function () {
  if (this.originalAmount === 0) return 0;
  return this.discountAmount / this.originalAmount;
};

// Static method to get total savings by user
bookingSchema.statics.getTotalUserSavings = function (userId) {
  return this.aggregate([
    { $match: { userId: userId, discountAmount: { $gt: 0 } } },
    { $group: { _id: null, totalSavings: { $sum: "$discountAmount" } } },
  ]);
};

module.exports = mongoose.model("Booking", bookingSchema);

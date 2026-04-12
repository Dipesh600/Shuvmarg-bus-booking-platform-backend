const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    couponCode: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [3, "Coupon code must be at least 3 characters long"],
      maxlength: [20, "Coupon code must not exceed 20 characters"],
    },
    title: {
      type: String,
      required: [true, "Coupon title is required"],
      trim: true,
      maxlength: [100, "Title must not exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must not exceed 500 characters"],
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: [true, "Discount type is required"],
    },
    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value must be positive"],
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, "Minimum order amount must be positive"],
      // The "minOrderAmount": 100 field represents the minimum order value required for a user to be eligible to use the coupon
    },
    maxDiscountAmount: {
      type: Number,
      default: null, // null means unlimited
      min: [0, "Maximum discount amount must be positive"],
    },
    validFrom: {
      type: Date,
      required: [true, "Valid from date is required"],
    },
    validTo: {
      type: Date,
      required: [true, "Valid to date is required"],
    },
    totalUsageLimit: {
      type: Number,
      default: null, // null means unlimited
      min: [1, "Total usage limit must be at least 1"],
    },
    perUserLimit: {
      type: Number,
      default: 1, // each user can use once by default
      min: [1, "Per user limit must be at least 1"],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, "Used count cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableRoutes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "busschedules", // can be used for specific routes only
      },
    ],
    excludedRoutes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "busschedules", // routes where this coupon cannot be used
      },
    ],
    applicableUserTypes: [
      {
        type: String,
        enum: ["passenger", "agent", "busOwner", "conductor", "driver"],
        default: ["passenger"],
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by admin is required"],
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
couponSchema.index({ couponCode: 1 });
couponSchema.index({ isActive: 1, validFrom: 1, validTo: 1 });
couponSchema.index({ createdBy: 1 });

// Virtual field to check if coupon is currently valid
couponSchema.virtual("isCurrentlyValid").get(function () {
  const now = new Date();
  return (
    this.isActive &&
    this.validFrom <= now &&
    this.validTo >= now &&
    (this.totalUsageLimit === null || this.usedCount < this.totalUsageLimit)
  );
});

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (orderAmount) {
  // Use the full validation logic including dates
  if (!this.isCurrentlyValid) {
    return 0;
  }

  if (orderAmount < this.minOrderAmount) {
    return 0;
  }

  let discountAmount = 0;

  if (this.discountType === "percentage") {
    discountAmount = (orderAmount * this.discountValue) / 100;
  } else if (this.discountType === "fixed") {
    discountAmount = this.discountValue;
  }

  // Apply maximum discount limit if set
  if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
    discountAmount = this.maxDiscountAmount;
  }

  // Ensure discount doesn't exceed order amount
  if (discountAmount > orderAmount) {
    discountAmount = orderAmount;
  }

  return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
};

// Pre-save middleware to validate dates
couponSchema.pre("save", function (next) {
  if (this.validFrom >= this.validTo) {
    return next(new Error("Valid from date must be before valid to date"));
  }

  if (this.discountType === "percentage" && this.discountValue > 100) {
    return next(new Error("Percentage discount cannot exceed 100%"));
  }

  next();
});

// Static method to find active coupons
couponSchema.statics.findActiveCoupons = function () {
  const now = new Date();
  return this.find({
    isActive: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    $or: [
      { totalUsageLimit: null },
      { $expr: { $lt: ["$usedCount", "$totalUsageLimit"] } },
    ],
  });
};

module.exports = mongoose.model("Coupon", couponSchema);

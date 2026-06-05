const Coupon = require("../models/couponModel");
const CouponUsage = require("../models/couponUsageModel");
const User = require("../models/userModel");

class CouponHelper {
  /**
   * Validate a coupon for a specific user and booking
   * @param {string} couponCode - The coupon code to validate
   * @param {string} userId - The user ID
   * @param {number} orderAmount - The order amount
   * @param {string} scheduleId - The bus schedule ID (optional)
   * @returns {Object} Validation result with coupon details or error
   */
  static async validateCoupon(
    couponCode,
    userId,
    orderAmount,
    scheduleId = null
  ) {
    try {
      // Find the coupon
      const coupon = await Coupon.findOne({
        couponCode: couponCode.toUpperCase(),
        isActive: true,
      });

      if (!coupon) {
        return {
          isValid: false,
          error: "Invalid coupon code",
          errorCode: "INVALID_COUPON",
        };
      }

      // Check if coupon is currently valid (date range)
      const now = new Date();
      const validFrom = new Date(coupon.validFrom);
      const validTo = new Date(coupon.validTo);

      // Debug logging (you can remove this later)
      console.log("Date Validation Debug:");
      console.log("Current Date:", now.toISOString());
      console.log("Valid From:", validFrom.toISOString());
      console.log("Valid To:", validTo.toISOString());
      console.log("Is Now < ValidFrom?", now < validFrom);
      console.log("Is Now > ValidTo?", now > validTo);

      if (now < validFrom) {
        return {
          isValid: false,
          error: `Coupon isn't active yet. Starts on ${validFrom
            .toISOString()
            .slice(0, 10)}`,
          errorCode: "COUPON_NOT_ACTIVE_YET",
        };
      }
      if (now > validTo) {
        return {
          isValid: false,
          error: "Coupon expired. You can't use it.",
          errorCode: "COUPON_EXPIRED",
        };
      }

      // Check minimum order amount
      if (orderAmount < coupon.minOrderAmount) {
        return {
          isValid: false,
          error: `Minimum order amount is ₹${coupon.minOrderAmount}`,
          errorCode: "MIN_AMOUNT_NOT_MET",
        };
      }

      // Check total usage limit
      if (
        coupon.totalUsageLimit &&
        coupon.usedCount >= coupon.totalUsageLimit
      ) {
        return {
          isValid: false,
          error: "Coupon usage limit reached",
          errorCode: "USAGE_LIMIT_REACHED",
        };
      }

      // Check per user limit
      const userUsageCount = await CouponUsage.getUserCouponUsageCount(
        userId,
        coupon._id
      );
      if (userUsageCount >= coupon.perUserLimit) {
        return {
          isValid: false,
          error: "You have already used this coupon maximum times",
          errorCode: "USER_LIMIT_REACHED",
        };
      }

      // User type restriction is advisory only — not a hard block during checkout
      // (Admins can see applicableUserTypes but it does not block users at validation)

      // Check route restrictions (if applicable)
      if (scheduleId && coupon.applicableRoutes.length > 0) {
        if (!coupon.applicableRoutes.includes(scheduleId)) {
          return {
            isValid: false,
            error: "This coupon is not valid for this route",
            errorCode: "ROUTE_NOT_APPLICABLE",
          };
        }
      }

      if (scheduleId && coupon.excludedRoutes.includes(scheduleId)) {
        return {
          isValid: false,
          error: "This coupon cannot be used for this route",
          errorCode: "ROUTE_EXCLUDED",
        };
      }

      // Calculate discount manually instead of using model method
      let discountAmount = 0;

      if (coupon.discountType === "percentage") {
        // For percentage discounts
        discountAmount = (orderAmount * coupon.discountValue) / 100;
      } else if (coupon.discountType === "fixed") {
        // For fixed amount discounts
        discountAmount = coupon.discountValue;
      }

      // Apply maximum discount limit if set
      if (
        coupon.maxDiscountAmount &&
        discountAmount > coupon.maxDiscountAmount
      ) {
        discountAmount = coupon.maxDiscountAmount;
      }

      // Ensure discount doesn't exceed order amount
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount;
      }

      // Round to 2 decimal places
      discountAmount = Math.round(discountAmount * 100) / 100;

      const finalAmount = orderAmount - discountAmount;
      const savingsPercentage =
        Math.round((discountAmount / orderAmount) * 100 * 100) / 100;

      return {
        isValid: true,
        coupon: coupon,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        savings: savingsPercentage,
      };
    } catch (error) {
      return {
        isValid: false,
        error: "Error validating coupon",
        errorCode: "VALIDATION_ERROR",
      };
    }
  }

  /**
   * Apply coupon to a booking
   * @param {string} couponCode - The coupon code
   * @param {string} userId - The user ID
   * @param {string} bookingId - The booking ID
   * @param {number} originalAmount - The original booking amount
   * @returns {Object} Result of coupon application
   */
  static async applyCoupon(couponCode, userId, bookingId, originalAmount) {
    try {
      // Validate coupon first
      const validation = await this.validateCoupon(
        couponCode,
        userId,
        originalAmount
      );

      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
          errorCode: validation.errorCode,
        };
      }

      const coupon = validation.coupon;
      const discountAmount = validation.discountAmount;
      const finalAmount = validation.finalAmount;

      // Create coupon usage record
      const couponUsage = new CouponUsage({
        userId: userId,
        couponId: coupon._id,
        couponCode: coupon.couponCode,
        bookingId: bookingId,
        originalAmount: originalAmount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      });

      await couponUsage.save();

      // Increment coupon usage count
      await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usedCount: 1 },
      });

      return {
        success: true,
        couponUsage: couponUsage,
        originalAmount: originalAmount,
        discountAmount: discountAmount,
        finalAmount: finalAmount,
        couponCode: coupon.couponCode,
      };
    } catch (error) {
      return {
        success: false,
        error: "Error applying coupon",
        errorCode: "APPLICATION_ERROR",
      };
    }
  }

  /**
   * Get available coupons for a user
   * @param {string} userId - The user ID
   * @param {number} orderAmount - The order amount (optional)
   * @returns {Array} List of available coupons
   */
  static async getAvailableCoupons(userId, orderAmount = 0) {
    try {
      const user = await User.findById(userId);
      const now = new Date();

      const coupons = await Coupon.find({
        isActive: true,
        validFrom: { $lte: now },
        validTo: { $gte: now },
        applicableUserTypes: { $in: user.roles || [user.role] },
        $or: [
          { totalUsageLimit: null },
          { $expr: { $lt: ["$usedCount", "$totalUsageLimit"] } },
        ],
      }).sort({ discountValue: -1 });

      const availableCoupons = [];

      for (const coupon of coupons) {
        // Check user usage limit
        const userUsageCount = await CouponUsage.getUserCouponUsageCount(
          userId,
          coupon._id
        );
        if (userUsageCount < coupon.perUserLimit) {
          const couponData = {
            _id: coupon._id,
            couponCode: coupon.couponCode,
            title: coupon.title,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minOrderAmount: coupon.minOrderAmount,
            maxDiscountAmount: coupon.maxDiscountAmount,
            validTo: coupon.validTo,
            usageLeft: coupon.perUserLimit - userUsageCount,
          };

          // Calculate potential discount if order amount is provided
          if (orderAmount > 0) {
            couponData.potentialDiscount =
              coupon.calculateDiscount(orderAmount);
            couponData.canUse = orderAmount >= coupon.minOrderAmount;
          }

          availableCoupons.push(couponData);
        }
      }

      return availableCoupons;
    } catch (error) {
      throw new Error("Error fetching available coupons");
    }
  }

  /**
   * Get coupon usage statistics for admin
   * @param {string} couponId - The coupon ID (optional)
   * @returns {Object} Usage statistics
   */
  static async getCouponStats(couponId = null) {
    try {
      let matchCondition = {};
      if (couponId) {
        matchCondition.couponId = couponId;
      }

      const stats = await CouponUsage.aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: "$couponId",
            totalUsage: { $sum: 1 },
            totalDiscountGiven: { $sum: "$discountAmount" },
            totalOriginalAmount: { $sum: "$originalAmount" },
            uniqueUsers: { $addToSet: "$userId" },
          },
        },
        {
          $lookup: {
            from: "coupons",
            localField: "_id",
            foreignField: "_id",
            as: "couponDetails",
          },
        },
        {
          $unwind: "$couponDetails",
        },
        {
          $project: {
            couponCode: "$couponDetails.couponCode",
            title: "$couponDetails.title",
            totalUsage: 1,
            totalDiscountGiven: 1,
            totalOriginalAmount: 1,
            uniqueUsersCount: { $size: "$uniqueUsers" },
            averageDiscount: {
              $divide: ["$totalDiscountGiven", "$totalUsage"],
            },
            conversionRate: {
              $multiply: [
                { $divide: ["$totalDiscountGiven", "$totalOriginalAmount"] },
                100,
              ],
            },
          },
        },
      ]);

      return stats;
    } catch (error) {
      throw new Error("Error fetching coupon statistics");
    }
  }

  /**
   * Refund coupon usage (when booking is cancelled)
   * @param {string} bookingId - The booking ID
   * @returns {Object} Refund result
   */
  static async refundCouponUsage(bookingId) {
    try {
      const couponUsage = await CouponUsage.findOne({ bookingId: bookingId });

      if (!couponUsage) {
        return {
          success: true,
          message: "No coupon usage found for this booking",
        };
      }

      // Mark coupon usage as refunded
      couponUsage.status = "refunded";
      await couponUsage.save();

      // Decrement coupon usage count
      await Coupon.findByIdAndUpdate(couponUsage.couponId, {
        $inc: { usedCount: -1 },
      });

      return {
        success: true,
        message: "Coupon usage refunded successfully",
        refundedAmount: couponUsage.discountAmount,
      };
    } catch (error) {
      return {
        success: false,
        error: "Error refunding coupon usage",
      };
    }
  }
}

module.exports = CouponHelper;

const Coupon = require("../../models/couponModel.js");
const CouponUsage = require("../../models/couponUsageModel.js");
const UserCouponUsage = require("../../models/userCouponUsageModel.js");
const CouponHelper = require("../../handlers/couponHelper.js");
const mongoose = require("mongoose");

// Get available coupons for user
const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { orderAmount } = req.query;

    const coupons = await CouponHelper.getAvailableCoupons(
      userId,
      parseFloat(orderAmount) || 0
    );

    return res.status(200).json({
      success: true,
      message: "Available coupons retrieved successfully!",
      data: coupons,
    });
  } catch (error) {
    console.error("Error fetching available coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Validate coupon before applying
const validateCoupon = async (req, res) => {
  try {
    const { couponCode, orderAmount, scheduleId } = req.body;
    const userId = req.userInfo.id;

    if (!couponCode || !orderAmount) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and order amount are required!",
      });
    }

    // Convert orderAmount to number to ensure proper calculation
    const numericOrderAmount = parseFloat(orderAmount);

    if (isNaN(numericOrderAmount)) {
      return res.status(400).json({
        success: false,
        message: "Order amount must be a valid number!",
      });
    }

    // First, find the coupon to get its ID and perUserLimit
    const coupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon code",
        errorCode: "INVALID_COUPON",
      });
    }

    // Check if user has already used this coupon
    const userUsageCount = await UserCouponUsage.getUserCouponUsageCount(
      userId,
      coupon._id
    );

    // If perUserLimit is 1 (default) and user has used it
    if (userUsageCount >= coupon.perUserLimit) {
      return res.status(400).json({
        success: false,
        message:
          userUsageCount === 1
            ? "You have already used this coupon"
            : `You can only use this coupon ${coupon.perUserLimit} times and you've used it ${userUsageCount} times`,
        errorCode: "USER_LIMIT_REACHED",
      });
    }

    // Continue with normal validation
    const validation = await CouponHelper.validateCoupon(
      couponCode,
      userId,
      numericOrderAmount,
      scheduleId
    );

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
        errorCode: validation.errorCode,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon is valid!",
      data: {
        couponCode: validation.coupon.couponCode,
        title: validation.coupon.title,
        description: validation.coupon.description,
        discountType: validation.coupon.discountType,
        discountValue: validation.coupon.discountValue,
        originalAmount: orderAmount,
        discountAmount: validation.discountAmount,
        finalAmount: validation.finalAmount,
        savings: validation.savings,
      },
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get user's coupon usage history
const getMyCouponUsage = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { page = 1, limit = 10 } = req.query;

    const usageHistory = await CouponUsage.find({ userId })
      .populate("couponId", "couponCode title description discountType")
      .populate("bookingId", "ticketId seats bookedAt")
      .sort({ usageDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CouponUsage.countDocuments({ userId });

    const formattedHistory = usageHistory.map((usage) => ({
      _id: usage._id,
      couponCode: usage.couponCode,
      couponTitle: usage.couponId?.title,
      couponDescription: usage.couponId?.description,
      ticketId: usage.bookingId?.ticketId,
      seats: usage.bookingId?.seats,
      originalAmount: usage.originalAmount,
      discountAmount: usage.discountAmount,
      finalAmount: usage.finalAmount,
      discountType: usage.discountType,
      discountValue: usage.discountValue,
      savings: usage.getSavingsPercentage(),
      usageDate: usage.usageDate,
      status: usage.status,
      bookedAt: usage.bookingId?.bookedAt,
    }));

    // Calculate total savings
    const totalSavings = usageHistory.reduce(
      (sum, usage) =>
        sum + (usage.status === "applied" ? usage.discountAmount : 0),
      0
    );

    return res.status(200).json({
      success: true,
      message: "Coupon usage history retrieved successfully!",
      data: formattedHistory,
      summary: {
        totalSavings: Math.round(totalSavings * 100) / 100,
        totalCouponsUsed: total,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching coupon usage history:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get best coupon for order amount
const getBestCoupon = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { orderAmount, scheduleId } = req.query;

    if (!orderAmount) {
      return res.status(400).json({
        success: false,
        message: "Order amount is required!",
      });
    }

    const availableCoupons = await CouponHelper.getAvailableCoupons(
      userId,
      parseFloat(orderAmount)
    );

    // Filter coupons that can be used and sort by discount amount
    const applicableCoupons = availableCoupons
      .filter((coupon) => coupon.canUse && coupon.potentialDiscount > 0)
      .sort((a, b) => b.potentialDiscount - a.potentialDiscount);

    if (applicableCoupons.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No applicable coupons found for this order amount.",
        data: null,
      });
    }

    const bestCoupon = applicableCoupons[0];

    return res.status(200).json({
      success: true,
      message: "Best coupon found!",
      data: {
        couponCode: bestCoupon.couponCode,
        title: bestCoupon.title,
        description: bestCoupon.description,
        discountType: bestCoupon.discountType,
        discountValue: bestCoupon.discountValue,
        potentialDiscount: bestCoupon.potentialDiscount,
        finalAmount: parseFloat(orderAmount) - bestCoupon.potentialDiscount,
        savings:
          Math.round(
            (bestCoupon.potentialDiscount / parseFloat(orderAmount)) * 100 * 100
          ) / 100,
      },
      alternatives: applicableCoupons.slice(1, 4), // Show up to 3 alternatives
    });
  } catch (error) {
    console.error("Error finding best coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Search coupons by code or name
const searchCoupons = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { query, orderAmount } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long!",
      });
    }

    const searchQuery = {
      isActive: true,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
      $or: [
        { couponCode: { $regex: query, $options: "i" } },
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    };

    const coupons = await Coupon.find(searchQuery)
      .sort({ discountValue: -1 })
      .limit(10);

    const results = [];

    for (const coupon of coupons) {
      // Check user eligibility
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
        if (orderAmount) {
          const amount = parseFloat(orderAmount);
          couponData.potentialDiscount = coupon.calculateDiscount(amount);
          couponData.canUse = amount >= coupon.minOrderAmount;
          couponData.finalAmount = amount - couponData.potentialDiscount;
        }

        results.push(couponData);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Found ${results.length} coupon(s) matching your search.`,
      data: results,
    });
  } catch (error) {
    console.error("Error searching coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get all coupons for user
const getAllCouponsForUser = async (req, res) => {
  try {
    // Find all active coupons
    const coupons = await Coupon.find({
      isActive: true,
      // validFrom: { $lte: new Date() },
      // validTo: { $gte: new Date() },
    });

    const results = [];

    for (const coupon of coupons) {
      const couponData = {
        _id: coupon._id,
        couponCode: coupon.couponCode,
        title: coupon.title,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscountAmount: coupon.maxDiscountAmount,
        validFrom: coupon.validFrom,
        validTo: coupon.validTo,
        perUserLimit: coupon.perUserLimit,
      };
      results.push(couponData);
    }

    return res.status(200).json({
      success: true,
      message: "All coupons retrieved successfully!",
      data: results,
    });
  } catch (error) {
    console.error("Error fetching all coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

module.exports = {
  getAvailableCoupons,
  validateCoupon,
  getMyCouponUsage,
  getBestCoupon,
  searchCoupons,
  getAllCouponsForUser,
};

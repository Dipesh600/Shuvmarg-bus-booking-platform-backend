const UserCouponUsage = require("../../models/userCouponUsageModel.js");
const Coupon = require("../../models/couponModel.js");

/**
 * Record a coupon usage when a user successfully books a ticket
 * @param {Object} req - Request object
 * @param {Object} res - Response object 
 */
const recordCouponUsage = async (req, res) => {
  try {
    const { 
      userId, 
      couponCode, 
      couponId,
      bookingId, 
      ticketId, 
      originalAmount, 
      discountAmount, 
      finalAmount 
    } = req.body;

    // Validate required fields
    if (!userId || !couponCode || !bookingId || !ticketId || !originalAmount || !finalAmount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // If couponId wasn't provided, find it by couponCode
    let actualCouponId = couponId;
    if (!actualCouponId) {
      const coupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });
      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon code"
        });
      }
      actualCouponId = coupon._id;
    }

    // Create the usage record
    const couponUsage = new UserCouponUsage({
      userId,
      couponId: actualCouponId,
      couponCode: couponCode.toUpperCase(),
      bookingId,
      ticketId,
      discountAmount: discountAmount || 0,
      originalAmount,
      finalAmount,
      usedAt: new Date(),
      status: "active"
    });

    await couponUsage.save();

    // Increment the coupon's usage count
    await Coupon.findByIdAndUpdate(
      actualCouponId, 
      { $inc: { usedCount: 1 } }
    );

    return res.status(201).json({
      success: true,
      message: "Coupon usage recorded successfully",
      data: {
        usageId: couponUsage._id,
        couponCode: couponUsage.couponCode,
        usedAt: couponUsage.usedAt
      }
    });
  } catch (error) {
    console.error("Error recording coupon usage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!"
    });
  }
};

/**
 * Check if a user has already used a coupon
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const checkCouponUsage = async (req, res) => {
  try {
    const { userId, couponCode } = req.query;

    if (!userId || !couponCode) {
      return res.status(400).json({
        success: false,
        message: "User ID and coupon code are required"
      });
    }

    // Find the coupon first
    const coupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    // Check usage count
    const usageCount = await UserCouponUsage.getUserCouponUsageCount(userId, coupon._id);
    const hasUsed = usageCount > 0;
    const usageLimit = coupon.perUserLimit;
    const usageRemaining = Math.max(0, usageLimit - usageCount);

    return res.status(200).json({
      success: true,
      data: {
        hasUsed,
        usageCount,
        usageLimit,
        usageRemaining,
        canUseAgain: usageCount < usageLimit
      }
    });
  } catch (error) {
    console.error("Error checking coupon usage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!"
    });
  }
};

/**
 * Get user's used coupons
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getUserUsedCoupons = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const usedCoupons = await UserCouponUsage.find({ userId })
      .populate("couponId", "couponCode title description discountType discountValue")
      .sort({ usedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await UserCouponUsage.countDocuments({ userId });

    return res.status(200).json({
      success: true,
      message: "User's used coupons retrieved successfully",
      data: usedCoupons.map(usage => ({
        _id: usage._id,
        couponCode: usage.couponCode,
        couponTitle: usage.couponId?.title,
        couponDescription: usage.couponId?.description,
        discountType: usage.couponId?.discountType,
        discountValue: usage.couponId?.discountValue,
        discountAmount: usage.discountAmount,
        originalAmount: usage.originalAmount,
        finalAmount: usage.finalAmount,
        savings: usage.getSavingsPercentage(),
        ticketId: usage.ticketId,
        usedAt: usage.usedAt,
        status: usage.status
      })),
      pagination: {
        totalItems: total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error fetching user's used coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!"
    });
  }
};

module.exports = {
  recordCouponUsage,
  checkCouponUsage,
  getUserUsedCoupons
};
const Coupon = require("../../../models/couponModel.js");
const CouponUsage = require("../../../models/couponUsageModel.js");
const CouponHelper = require("../../../handlers/couponHelper.js");
const mongoose = require("mongoose");

// Create new coupon
const createCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      validFrom,
      validTo,
      totalUsageLimit,
      perUserLimit,
      applicableRoutes,
      excludedRoutes,
      applicableUserTypes,
    } = req.body;

    // Validation
    if (
      !couponCode ||
      !title ||
      !discountType ||
      !discountValue ||
      !validFrom ||
      !validTo
    ) {
      const missingField = !couponCode
        ? "Coupon Code"
        : !title
        ? "Title"
        : !discountType
        ? "Discount Type"
        : !discountValue
        ? "Discount Value"
        : !validFrom
        ? "Valid From Date"
        : "Valid To Date";

      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    // Check if discount type is valid
    if (!["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        success: false,
        message: "Discount type must be either 'percentage' or 'fixed'!",
      });
    }

    // Validate percentage discount
    if (
      discountType === "percentage" &&
      (discountValue < 0 || discountValue > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Percentage discount must be between 0 and 100!",
      });
    }

    // Validate fixed discount
    if (discountType === "fixed" && discountValue < 0) {
      return res.status(400).json({
        success: false,
        message: "Fixed discount amount must be positive!",
      });
    }

    // Validate dates
    const fromDate = new Date(validFrom);
    const toDate = new Date(validTo);

    if (fromDate >= toDate) {
      return res.status(400).json({
        success: false,
        message: "Valid from date must be before valid to date!",
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists!",
      });
    }

    // Create new coupon
    const newCoupon = new Coupon({
      couponCode: couponCode.toUpperCase(),
      title,
      description,
      discountType,
      discountValue,
      minOrderAmount: minOrderAmount || 0,
      maxDiscountAmount: maxDiscountAmount || null,
      validFrom: fromDate,
      validTo: toDate,
      totalUsageLimit: totalUsageLimit || null,
      perUserLimit: perUserLimit || 1,
      applicableRoutes: applicableRoutes || [],
      excludedRoutes: excludedRoutes || [],
      applicableUserTypes: applicableUserTypes || ["passenger"],
      createdBy: req.userInfo.id,
      lastModifiedBy: req.userInfo.id,
    });

    const savedCoupon = await newCoupon.save();

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully!",
      data: {
        _id: savedCoupon._id,
        couponCode: savedCoupon.couponCode,
        title: savedCoupon.title,
        description: savedCoupon.description,
        discountType: savedCoupon.discountType,
        discountValue: savedCoupon.discountValue,
        minOrderAmount: savedCoupon.minOrderAmount,
        maxDiscountAmount: savedCoupon.maxDiscountAmount,
        validFrom: savedCoupon.validFrom,
        validTo: savedCoupon.validTo,
        totalUsageLimit: savedCoupon.totalUsageLimit,
        perUserLimit: savedCoupon.perUserLimit,
        isActive: savedCoupon.isActive,
        usedCount: savedCoupon.usedCount,
        createdAt: savedCoupon.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get all coupons
const getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    let query = {};

    // Filter by status
    if (status === "active") {
      const now = new Date();
      query = {
        isActive: true,
        validFrom: { $lte: now },
        validTo: { $gte: now },
      };
    } else if (status === "expired") {
      const now = new Date();
      query = {
        $or: [{ isActive: false }, { validTo: { $lt: now } }],
      };
    } else if (status === "upcoming") {
      const now = new Date();
      query = {
        isActive: true,
        validFrom: { $gt: now },
      };
    }

    // Search by coupon code or title
    if (search) {
      query.$or = [
        { couponCode: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
      ];
    }

    const coupons = await Coupon.find(query)
      .populate("createdBy", "name email")
      .populate("lastModifiedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Coupon.countDocuments(query);

    if (!coupons || coupons.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No coupons found!",
      });
    }

    const formattedCoupons = coupons.map((coupon) => ({
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
      totalUsageLimit: coupon.totalUsageLimit,
      perUserLimit: coupon.perUserLimit,
      usedCount: coupon.usedCount,
      isActive: coupon.isActive,
      isCurrentlyValid: coupon.isCurrentlyValid,
      applicableUserTypes: coupon.applicableUserTypes,
      createdBy: coupon.createdBy,
      lastModifiedBy: coupon.lastModifiedBy,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Coupons retrieved successfully!",
      data: formattedCoupons,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalCoupons: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get coupon by ID
const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Coupon ID is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format!",
      });
    }

    const coupon = await Coupon.findById(id)
      .populate("createdBy", "name email")
      .populate("lastModifiedBy", "name email");

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found!",
      });
    }

    // Get usage statistics
    const usageStats = await CouponHelper.getCouponStats(id);

    return res.status(200).json({
      success: true,
      message: "Coupon retrieved successfully!",
      data: {
        ...coupon.toObject(),
        isCurrentlyValid: coupon.isCurrentlyValid,
        usageStats: usageStats[0] || {
          totalUsage: 0,
          totalDiscountGiven: 0,
          uniqueUsersCount: 0,
          averageDiscount: 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Coupon ID is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format!",
      });
    }

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found!",
      });
    }

    // Validate discount type if being updated
    if (
      updates.discountType &&
      !["percentage", "fixed"].includes(updates.discountType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Discount type must be either 'percentage' or 'fixed'!",
      });
    }

    // Validate dates if being updated
    if (updates.validFrom || updates.validTo) {
      const fromDate = new Date(updates.validFrom || coupon.validFrom);
      const toDate = new Date(updates.validTo || coupon.validTo);

      if (fromDate >= toDate) {
        return res.status(400).json({
          success: false,
          message: "Valid from date must be before valid to date!",
        });
      }
    }

    // Update fields
    Object.keys(updates).forEach((key) => {
      if (key !== "_id" && key !== "createdBy" && key !== "usedCount") {
        if (key === "couponCode") {
          coupon[key] = updates[key].toUpperCase();
        } else {
          coupon[key] = updates[key];
        }
      }
    });

    coupon.lastModifiedBy = req.userInfo.id;
    const updatedCoupon = await coupon.save();

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully!",
      data: {
        _id: updatedCoupon._id,
        couponCode: updatedCoupon.couponCode,
        title: updatedCoupon.title,
        description: updatedCoupon.description,
        discountType: updatedCoupon.discountType,
        discountValue: updatedCoupon.discountValue,
        minOrderAmount: updatedCoupon.minOrderAmount,
        maxDiscountAmount: updatedCoupon.maxDiscountAmount,
        validFrom: updatedCoupon.validFrom,
        validTo: updatedCoupon.validTo,
        totalUsageLimit: updatedCoupon.totalUsageLimit,
        perUserLimit: updatedCoupon.perUserLimit,
        isActive: updatedCoupon.isActive,
        usedCount: updatedCoupon.usedCount,
        updatedAt: updatedCoupon.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Coupon ID is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format!",
      });
    }

    // Check if coupon has been used
    const usageCount = await CouponUsage.countDocuments({ couponId: id });

    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete coupon that has been used. You can deactivate it instead.",
      });
    }

    const deletedCoupon = await Coupon.findByIdAndDelete(id);

    if (!deletedCoupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Toggle coupon status (activate/deactivate)
const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Coupon ID is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon ID format!",
      });
    }

    const coupon = await Coupon.findById(id);

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found!",
      });
    }

    coupon.isActive = !coupon.isActive;
    coupon.lastModifiedBy = req.userInfo.id;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon ${
        coupon.isActive ? "activated" : "deactivated"
      } successfully!`,
      data: {
        _id: coupon._id,
        couponCode: coupon.couponCode,
        isActive: coupon.isActive,
      },
    });
  } catch (error) {
    console.error("Error toggling coupon status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// Get coupon usage statistics
const getCouponUsageStats = async (req, res) => {
  try {
    const stats = await CouponHelper.getCouponStats();

    return res.status(200).json({
      success: true,
      message: "Coupon usage statistics retrieved successfully!",
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching coupon stats:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponUsageStats,
};

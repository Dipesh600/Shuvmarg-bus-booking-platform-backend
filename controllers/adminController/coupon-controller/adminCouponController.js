const Coupon = require("../../../models/couponModel.js");
const CouponUsage = require("../../../models/couponUsageModel.js");
const CouponHelper = require("../../../handlers/couponHelper.js");
const mongoose = require("mongoose");
const path = require("path");
const UserDeviceInfo = require("../../../models/userDeviceInfoModel.js");
const {
  notificationManager,
  createLocalNotification,
} = require("../../notificationController/notification_manager.js");
const User = require("../../../models/userModel.js");
const { uploadFileToS3, buildS3Path, getDisplayUrl, deleteFromS3 } = require("../../../services/s3Service.js");

// Delete an orphaned coupon image from S3 (e.g. admin uploaded but cancelled the form).
// Expects a raw S3 object key — the DB always stores the raw key, never a full URL.
const deleteOrphanedCouponImage = async (req, res) => {
  try {
    const { objectKey } = req.body;
    if (!objectKey || typeof objectKey !== "string") {
      return res.status(400).json({ success: false, message: "objectKey is required." });
    }
    // Safety: normalise the key first to prevent path traversal, then enforce folder scope.
    // e.g. "platform/coupons/../../owners/kyc/..." normalises to "owners/kyc/..." → rejected.
    const normalizedKey = path.posix.normalize(objectKey);
    if (!normalizedKey.startsWith("platform/coupons/")) {
      return res.status(403).json({ success: false, message: "Cannot delete this object key." });
    }
    await deleteFromS3(objectKey);
    return res.status(200).json({ success: true, message: "Image removed from storage." });
  } catch (error) {
    console.error("deleteOrphanedCouponImage error:", error);
    return res.status(500).json({ success: false, message: "Failed to remove image." });
  }
};

// Upload a coupon image — stores raw S3 key in DB, returns 7-day presigned URL for preview
const uploadCouponImage = async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }
    const file = req.files.image;

    // Upload to S3 — returns the raw object key (e.g. "platform/coupons/1234.jpg")
    const folderPath = buildS3Path({ type: "coupon_image" });
    const objectKey = await uploadFileToS3(file, folderPath);

    // Generate a 7-day presigned URL for the admin preview.
    // The raw objectKey is what gets stored in MongoDB — never the presigned URL.
    const previewUrl = await getDisplayUrl(objectKey);

    return res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      imageUrl: objectKey,    // ← raw S3 key — STORE THIS in the coupon document
      previewUrl,             // ← 7-day presigned URL for immediate admin preview only
    });
  } catch (error) {
    console.error("uploadCouponImage error:", error);
    return res.status(500).json({ success: false, message: "Failed to upload image." });
  }
};


/**
 * Sends an FCM push notification to all passengers about a new/activated offer.
 * Fire-and-forget — does NOT await at call site so it never delays the API response.
 */
const sendOfferNotificationToPassengers = (couponCode, title, discountType, discountValue) => {
  // Run entirely in the background after the current event loop tick
  setImmediate(async () => {
    try {
      // Get all passenger user IDs
      const passengerUsers = await User.find(
        { roles: "passenger", status: "active" },
        { _id: 1 }
      ).lean();
      const passengerIds = passengerUsers.map((u) => u._id.toString());

      if (passengerIds.length === 0) return;

      // Get FCM tokens for those users
      const devices = await UserDeviceInfo.find({
        userId: { $in: passengerIds },
      }).lean();
      const tokens = devices.map((d) => d.token).filter(Boolean);

      const discountLabel =
        discountType === "percentage"
          ? `${discountValue}% OFF`
          : `Rs. ${discountValue} OFF`;

      const notifTitle = `🎉 New Offer: ${discountLabel} on your next trip!`;
      const notifBody = `Use code ${couponCode} — ${title}. Book now before it expires!`;

      // Send FCM push if we have tokens
      if (tokens.length > 0) {
        await notificationManager(tokens, notifTitle, notifBody);
      }

      // Chunk local notifications to avoid overwhelming the event loop and memory
      const chunkSize = 100;
      for (let i = 0; i < passengerIds.length; i += chunkSize) {
        const chunk = passengerIds.slice(i, i + chunkSize);
        await Promise.allSettled(
          chunk.map((uid) =>
            createLocalNotification(uid, "COUPON_OFFER", notifTitle, notifBody, {
              couponCode,
            })
          )
        );
      }
    } catch (err) {
      // Never crash the main flow
      console.error("[Offer Notification] Failed:", err.message);
    }
  });
};

// Create new coupon
const createCoupon = async (req, res) => {
  try {
    const {
      couponCode,
      title,
      description,
      category,
      imageUrl,
      designConfig,
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
      category,
      imageUrl,
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
      applicableUserTypes: applicableUserTypes || [],  // empty = all user types
      designConfig: designConfig || undefined,
      createdBy: req.adminInfo.id,
      lastModifiedBy: req.adminInfo.id,
    });

    const savedCoupon = await newCoupon.save();

    // Fire push notification to all passengers — non-blocking
    sendOfferNotificationToPassengers(
      savedCoupon.couponCode,
      savedCoupon.title,
      savedCoupon.discountType,
      savedCoupon.discountValue
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully!",
      data: {
        _id: savedCoupon._id,
        couponCode: savedCoupon.couponCode,
        title: savedCoupon.title,
        description: savedCoupon.description,
        category: savedCoupon.category,
        imageUrl: savedCoupon.imageUrl,
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

    // An empty list is valid — not a 404. Return 200 with an empty array so the
    // frontend can distinguish "no coupons yet" from a real fetch error.
    if (!coupons || coupons.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No coupons found.",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages: 0,
          totalCoupons: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Resolve S3 keys to 7-day presigned URLs in parallel.
    // Handles both raw keys ("platform/coupons/...") and legacy full URLs.
    const resolveImageUrl = async (imageUrl) => {
      if (!imageUrl) return null;
      let key = imageUrl;
      if (key.startsWith("http")) {
        try { key = new URL(key).pathname.replace(/^\//, ""); } catch { return null; }
      }
      return await getDisplayUrl(key);
    };

    const formattedCoupons = await Promise.all(
      coupons.map(async (coupon) => ({
        _id: coupon._id,
        couponCode: coupon.couponCode,
        title: coupon.title,
        description: coupon.description,
        category: coupon.category,
        imageUrl: await resolveImageUrl(coupon.imageUrl),
        designConfig: coupon.designConfig,
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
      }))
    );

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

    // Resolve imageUrl → 7-day presigned URL for the admin edit form preview.
    // Handles both raw keys ("platform/coupons/...") and legacy full URLs.
    const couponObj = coupon.toObject();
    if (couponObj.imageUrl) {
      let key = couponObj.imageUrl;
      if (key.startsWith("http")) {
        try { key = new URL(key).pathname.replace(/^\//, ""); } catch { key = null; }
      }
      couponObj.imageUrlResolved = key ? await getDisplayUrl(key) : null;
    } else {
      couponObj.imageUrlResolved = null;
    }

    return res.status(200).json({
      success: true,
      message: "Coupon retrieved successfully!",
      data: {
        ...couponObj,
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

    // Capture the old image key BEFORE we overwrite it — we'll need it for cleanup.
    // Normalise legacy full URLs → raw key (same format as what the DB should hold).
    const oldImageKey = (() => {
      const raw = coupon.imageUrl;
      if (!raw) return null;
      if (raw.startsWith("http")) {
        try { return new URL(raw).pathname.replace(/^\//, ""); } catch { return null; }
      }
      return raw;
    })();

    // Explicit allowlist — only these fields may be changed via the update API.
    // This prevents mass-assignment: an attacker cannot overwrite internal
    // fields like usedCount, createdBy, __v, or Mongoose internals by including
    // them in the request body.
    const EDITABLE_FIELDS = [
      "couponCode", "title", "description", "category", "imageUrl",
      "designConfig", "discountType", "discountValue", "minOrderAmount",
      "maxDiscountAmount", "validFrom", "validTo", "totalUsageLimit",
      "perUserLimit", "applicableRoutes", "excludedRoutes",
      "applicableUserTypes", "isActive",
    ];

    EDITABLE_FIELDS.forEach((key) => {
      if (!(key in updates)) return; // only update keys that were explicitly sent
      if (key === "couponCode") {
        coupon.couponCode = updates.couponCode.toUpperCase();
      } else {
        coupon[key] = updates[key];
      }
      if (typeof updates[key] === "object" && updates[key] !== null) {
        coupon.markModified(key);
      }
    });

    coupon.lastModifiedBy = req.adminInfo.id;
    const updatedCoupon = await coupon.save();

    // ── Old-image cleanup ────────────────────────────────────────────────────
    // Delete the previous S3 object only if:
    //   1. A new imageUrl was submitted in this request
    //   2. The new key is genuinely different from the old key
    //   3. The old key belongs to the coupon folder (safety guard)
    // We do this AFTER a successful save — never risk losing the image if the
    // DB write failed.
    if ("imageUrl" in updates && oldImageKey && oldImageKey.startsWith("platform/coupons/")) {
      const newKey = updates.imageUrl; // already a raw key from the upload step
      const normalizedOld = path.posix.normalize(oldImageKey);
      if (newKey !== normalizedOld) {
        // Fire-and-forget — a failed S3 delete must never break the API response
        deleteFromS3(normalizedOld).catch((err) =>
          console.warn("[updateCoupon] Failed to delete old coupon image:", normalizedOld, err?.message)
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully!",
      data: {
        _id: updatedCoupon._id,
        couponCode: updatedCoupon.couponCode,
        title: updatedCoupon.title,
        description: updatedCoupon.description,
        category: updatedCoupon.category,
        imageUrl: updatedCoupon.imageUrl,
        discountType: updatedCoupon.discountType,
        discountValue: updatedCoupon.discountValue,
        minOrderAmount: updatedCoupon.minOrderAmount,
        maxDiscountAmount: updatedCoupon.maxDiscountAmount,
        validFrom: updatedCoupon.validFrom,
        validTo: updatedCoupon.validTo,
        designConfig: updatedCoupon.designConfig,
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
    coupon.lastModifiedBy = req.adminInfo.id;
    await coupon.save();

    // If the coupon was just activated, notify all passengers
    if (coupon.isActive) {
      sendOfferNotificationToPassengers(
        coupon.couponCode,
        coupon.title,
        coupon.discountType,
        coupon.discountValue
      ).catch(() => {});
    }

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

  getCouponUsageStats,
  uploadCouponImage,
  deleteOrphanedCouponImage,
};

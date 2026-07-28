"use strict";

const createCouponReadService = ({
  repository,
  getCouponStats,
  getDisplayUrl,
  imageKeyPolicy,
  mapper,
  clock = () => new Date(),
}) => {
  const resolveImageUrl = async (imageUrl) => {
    const key = imageKeyPolicy.storedImageKey(imageUrl);
    return key ? getDisplayUrl(key) : null;
  };

  const list = async ({ page = 1, limit = 10, status, search }) => {
    let query = {};
    if (status === "active") {
      const now = clock();
      query = {
        isActive: true,
        validFrom: { $lte: now },
        validTo: { $gte: now },
      };
    } else if (status === "expired") {
      const now = clock();
      query = { $or: [{ isActive: false }, { validTo: { $lt: now } }] };
    } else if (status === "upcoming") {
      const now = clock();
      query = { isActive: true, validFrom: { $gt: now } };
    }
    if (search) {
      query.$or = [
        { couponCode: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
      ];
    }
    const coupons = await repository.findPage(query, page, limit);
    const total = await repository.count(query);
    if (!coupons || coupons.length === 0) {
      return {
        statusCode: 200,
        body: {
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
        },
      };
    }
    const data = await Promise.all(
      coupons.map((coupon) =>
        mapper.mapCouponListItem(coupon, resolveImageUrl)
      )
    );
    const totalPages = Math.ceil(total / limit);
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Coupons retrieved successfully!",
        data,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCoupons: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  };

  const getById = async (id) => {
    const coupon = await repository.findById(id);
    if (!coupon) {
      return {
        statusCode: 404,
        body: { success: false, message: "Coupon not found!" },
      };
    }
    const usageStats = await getCouponStats(id);
    const couponObject = coupon.toObject();
    couponObject.imageUrlResolved = await resolveImageUrl(couponObject.imageUrl);
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Coupon retrieved successfully!",
        data: {
          ...couponObject,
          isCurrentlyValid: coupon.isCurrentlyValid,
          usageStats: usageStats[0] || mapper.emptyUsageStats(),
        },
      },
    };
  };

  return { list, getById };
};

module.exports = { createCouponReadService };

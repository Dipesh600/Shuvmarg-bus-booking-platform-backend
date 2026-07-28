"use strict";

const emptyUsageStats = () => ({
  totalUsage: 0,
  totalDiscountGiven: 0,
  uniqueUsersCount: 0,
  averageDiscount: 0,
});

const mapCouponListItem = async (coupon, resolveImageUrl) => ({
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
});

module.exports = { emptyUsageStats, mapCouponListItem };

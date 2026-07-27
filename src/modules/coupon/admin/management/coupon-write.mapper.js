"use strict";

const createCouponData = (coupon) => ({
  _id: coupon._id,
  couponCode: coupon.couponCode,
  title: coupon.title,
  description: coupon.description,
  category: coupon.category,
  imageUrl: coupon.imageUrl,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  minOrderAmount: coupon.minOrderAmount,
  maxDiscountAmount: coupon.maxDiscountAmount,
  validFrom: coupon.validFrom,
  validTo: coupon.validTo,
  totalUsageLimit: coupon.totalUsageLimit,
  perUserLimit: coupon.perUserLimit,
  isActive: coupon.isActive,
  usedCount: coupon.usedCount,
  createdAt: coupon.createdAt,
});

const updateCouponData = (coupon) => ({
  _id: coupon._id,
  couponCode: coupon.couponCode,
  title: coupon.title,
  description: coupon.description,
  category: coupon.category,
  imageUrl: coupon.imageUrl,
  discountType: coupon.discountType,
  discountValue: coupon.discountValue,
  minOrderAmount: coupon.minOrderAmount,
  maxDiscountAmount: coupon.maxDiscountAmount,
  validFrom: coupon.validFrom,
  validTo: coupon.validTo,
  designConfig: coupon.designConfig,
  totalUsageLimit: coupon.totalUsageLimit,
  perUserLimit: coupon.perUserLimit,
  isActive: coupon.isActive,
  usedCount: coupon.usedCount,
  updatedAt: coupon.updatedAt,
});

module.exports = { createCouponData, updateCouponData };

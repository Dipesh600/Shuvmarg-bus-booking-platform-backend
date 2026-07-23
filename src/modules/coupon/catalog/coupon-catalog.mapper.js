'use strict';

const { resolveCouponImageUrl: defaultResolveImage } = require('./coupon-image-url.service.js');

async function mapActiveCoupon(coupon, resolveImage = defaultResolveImage) {
  return {
    _id: coupon._id,
    couponCode: coupon.couponCode,
    title: coupon.title,
    description: coupon.description,
    category: coupon.category,
    imageUrl: await resolveImage(coupon.imageUrl),
    designConfig: coupon.designConfig,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    validFrom: coupon.validFrom,
    validTo: coupon.validTo,
    perUserLimit: coupon.perUserLimit,
  };
}

async function mapCouponIncludingStatus(coupon, resolveImage = defaultResolveImage) {
  return {
    _id: coupon._id,
    couponCode: coupon.couponCode,
    title: coupon.title,
    description: coupon.description,
    category: coupon.category,
    imageUrl: await resolveImage(coupon.imageUrl),
    designConfig: coupon.designConfig,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    validFrom: coupon.validFrom,
    validTo: coupon.validTo,
    perUserLimit: coupon.perUserLimit,
    isActive: coupon.isActive,
  };
}

async function mapActiveCouponList(coupons, resolveImage = defaultResolveImage) {
  return Promise.all(coupons.map((coupon) => mapActiveCoupon(coupon, resolveImage)));
}

async function mapCouponListIncludingStatus(coupons, resolveImage = defaultResolveImage) {
  return Promise.all(coupons.map((coupon) => mapCouponIncludingStatus(coupon, resolveImage)));
}

module.exports = {
  mapActiveCoupon,
  mapCouponIncludingStatus,
  mapActiveCouponList,
  mapCouponListIncludingStatus,
};

"use strict";

function mapValidatedCoupon(validation, originalAmount) {
  return {
    couponCode: validation.coupon.couponCode,
    title: validation.coupon.title,
    description: validation.coupon.description,
    discountType: validation.coupon.discountType,
    discountValue: validation.coupon.discountValue,
    originalAmount,
    discountAmount: validation.discountAmount,
    finalAmount: validation.finalAmount,
    savings: validation.savings,
  };
}

function mapUsage(usage) {
  return {
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
  };
}

function mapSearchCoupon(coupon, usageCount, orderAmount) {
  const data = {
    _id: coupon._id,
    couponCode: coupon.couponCode,
    title: coupon.title,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    validTo: coupon.validTo,
    usageLeft: coupon.perUserLimit - usageCount,
  };
  if (orderAmount) {
    const amount = parseFloat(orderAmount);
    data.potentialDiscount = coupon.calculateDiscount(amount);
    data.canUse = amount >= coupon.minOrderAmount;
    data.finalAmount = amount - data.potentialDiscount;
  }
  return data;
}

module.exports = { mapValidatedCoupon, mapUsage, mapSearchCoupon };

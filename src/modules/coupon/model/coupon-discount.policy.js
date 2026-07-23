"use strict";

function calculateCouponDiscount(coupon, orderAmount) {
  if (!coupon.isCurrentlyValid) {
    return 0;
  }

  if (orderAmount < coupon.minOrderAmount) {
    return 0;
  }

  let discountAmount = 0;

  if (coupon.discountType === "percentage") {
    discountAmount = (orderAmount * coupon.discountValue) / 100;
  } else if (coupon.discountType === "fixed") {
    discountAmount = coupon.discountValue;
  }

  if (
    coupon.maxDiscountAmount &&
    discountAmount > coupon.maxDiscountAmount
  ) {
    discountAmount = coupon.maxDiscountAmount;
  }

  if (discountAmount > orderAmount) {
    discountAmount = orderAmount;
  }

  return Math.round(discountAmount * 100) / 100;
}

module.exports = {
  calculateCouponDiscount,
};

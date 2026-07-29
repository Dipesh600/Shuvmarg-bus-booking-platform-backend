"use strict";

function createCouponAvailabilityService({ couponHelper }) {
  async function getAvailableCoupons(input) {
    const coupons = await couponHelper.getAvailableCoupons(
      input.userId,
      parseFloat(input.orderAmount) || 0,
      input.activeRole
    );
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Available coupons retrieved successfully!",
        data: coupons,
      },
    };
  }

  async function getBestCoupon(input) {
    if (!input.orderAmount) {
      return {
        statusCode: 400,
        body: { success: false, message: "Order amount is required!" },
      };
    }
    const amount = parseFloat(input.orderAmount);
    const available = await couponHelper.getAvailableCoupons(
      input.userId,
      amount,
      input.activeRole
    );
    const applicable = available
      .filter((coupon) => coupon.canUse && coupon.potentialDiscount > 0)
      .sort((a, b) => b.potentialDiscount - a.potentialDiscount);
    if (applicable.length === 0) {
      return {
        statusCode: 200,
        body: {
          success: true,
          message: "No applicable coupons found for this order amount.",
          data: null,
        },
      };
    }
    const best = applicable[0];
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Best coupon found!",
        data: {
          couponCode: best.couponCode,
          title: best.title,
          description: best.description,
          discountType: best.discountType,
          discountValue: best.discountValue,
          potentialDiscount: best.potentialDiscount,
          finalAmount: amount - best.potentialDiscount,
          savings:
            Math.round((best.potentialDiscount / amount) * 100 * 100) / 100,
        },
        alternatives: applicable.slice(1, 4),
      },
    };
  }

  return { getAvailableCoupons, getBestCoupon };
}

module.exports = { createCouponAvailabilityService };

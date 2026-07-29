"use strict";

function createPassengerCouponRepository({
  Coupon,
  CouponUsage,
  UserCouponUsage,
}) {
  async function findActiveCoupon(couponCode) {
    return Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
      isActive: true,
    });
  }

  function countValidationUsage(userId, couponId) {
    return UserCouponUsage.getUserCouponUsageCount(userId, couponId);
  }

  async function findUsageHistory(userId, page, limit) {
    return CouponUsage.find({ userId })
      .populate("couponId", "couponCode title description discountType")
      .populate("bookingId", "ticketId seats bookedAt")
      .sort({ usageDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
  }

  function countUsageHistory(userId) {
    return CouponUsage.countDocuments({ userId });
  }

  async function searchCoupons(searchQuery) {
    return Coupon.find(searchQuery).sort({ discountValue: -1 }).limit(10);
  }

  function countSearchUsage(userId, couponId) {
    return CouponUsage.getUserCouponUsageCount(userId, couponId);
  }

  return {
    findActiveCoupon,
    countValidationUsage,
    findUsageHistory,
    countUsageHistory,
    searchCoupons,
    countSearchUsage,
  };
}

module.exports = { createPassengerCouponRepository };

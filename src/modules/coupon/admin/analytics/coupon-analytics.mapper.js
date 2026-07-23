'use strict';

function formatSummary(summaryAgg) {
  return summaryAgg[0] || {
    totalRedemptions: 0,
    totalDiscountBurned: 0,
    totalOriginalGMV: 0,
    uniqueUsersCount: 0,
    refundedCount: 0,
    avgDiscountPerUsage: 0,
  };
}

function formatUsageLog(usageLog) {
  return usageLog.map((usage) => ({
    _id: usage._id,
    userName: usage.userId?.name || "Unknown",
    userPhone: usage.userId?.phone || "",
    bookingRef:
      usage.bookingId?.ticketId ||
      usage.bookingId?.toString() ||
      "N/A",
    originalAmount: usage.originalAmount,
    discountAmount: usage.discountAmount,
    finalAmount: usage.finalAmount,
    status: usage.status,
    usageDate: usage.usageDate,
  }));
}

function mapCouponDetails(coupon) {
  return {
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
    createdBy: coupon.createdBy,
    lastModifiedBy: coupon.lastModifiedBy,
    createdAt: coupon.createdAt,
  };
}

function toCouponAnalyticsData({ coupon, summaryAgg, dailyUsage, topUsers, usageLog }) {
  return {
    coupon: mapCouponDetails(coupon),
    summary: formatSummary(summaryAgg),
    dailyUsage,
    topUsers,
    usageLog: formatUsageLog(usageLog),
  };
}

module.exports = {
  formatSummary,
  formatUsageLog,
  mapCouponDetails,
  toCouponAnalyticsData,
};

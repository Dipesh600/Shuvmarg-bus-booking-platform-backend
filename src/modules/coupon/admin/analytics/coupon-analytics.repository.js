'use strict';

const mongoose = require("mongoose");
const Coupon = require("../../../../../models/couponModel.js");
const CouponUsage = require("../../../../../models/couponUsageModel.js");

async function findCouponByIdWithCreators(id) {
  return Coupon.findById(id)
    .populate("createdBy", "name email")
    .populate("lastModifiedBy", "name email");
}

async function aggregateDailyUsageByCouponId(id) {
  return CouponUsage.aggregate([
    { $match: { couponId: new mongoose.Types.ObjectId(id), status: "applied" } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$usageDate" } },
        redemptions: { $sum: 1 },
        totalDiscount: { $sum: "$discountAmount" },
        totalOriginal: { $sum: "$originalAmount" },
        totalFinal: { $sum: "$finalAmount" },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 60 },
  ]);
}

async function aggregateTopUsersByCouponId(id) {
  return CouponUsage.aggregate([
    { $match: { couponId: new mongoose.Types.ObjectId(id), status: "applied" } },
    {
      $group: {
        _id: "$userId",
        timesUsed: { $sum: 1 },
        totalDiscount: { $sum: "$discountAmount" },
        lastUsed: { $max: "$usageDate" },
      },
    },
    { $sort: { timesUsed: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userInfo",
      },
    },
    { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        name: { $ifNull: ["$userInfo.name", "Unknown"] },
        phone: { $ifNull: ["$userInfo.phone", ""] },
        timesUsed: 1,
        totalDiscount: 1,
        lastUsed: 1,
      },
    },
  ]);
}

async function findLatestCouponUsageLogs(id) {
  return CouponUsage.find({
    couponId: new mongoose.Types.ObjectId(id),
  })
    .populate("userId", "name phone email")
    .populate("bookingId", "ticketId")
    .sort({ usageDate: -1 })
    .limit(50);
}

async function aggregateCouponSummaryByCouponId(id) {
  return CouponUsage.aggregate([
    { $match: { couponId: new mongoose.Types.ObjectId(id) } },
    {
      $group: {
        _id: null,
        totalRedemptions: { $sum: { $cond: [{ $eq: ["$status", "applied"] }, 1, 0] } },
        totalDiscountBurned: { $sum: { $cond: [{ $eq: ["$status", "applied"] }, "$discountAmount", 0] } },
        totalOriginalGMV: { $sum: "$originalAmount" },
        uniqueUsers: { $addToSet: "$userId" },
        refundedCount: { $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] } },
      },
    },
    {
      $project: {
        totalRedemptions: 1,
        totalDiscountBurned: 1,
        totalOriginalGMV: 1,
        uniqueUsersCount: { $size: "$uniqueUsers" },
        refundedCount: 1,
        avgDiscountPerUsage: {
          $cond: [
            { $gt: ["$totalRedemptions", 0] },
            { $divide: ["$totalDiscountBurned", "$totalRedemptions"] },
            0,
          ],
        },
      },
    },
  ]);
}

module.exports = {
  findCouponByIdWithCreators,
  aggregateDailyUsageByCouponId,
  aggregateTopUsersByCouponId,
  findLatestCouponUsageLogs,
  aggregateCouponSummaryByCouponId,
};

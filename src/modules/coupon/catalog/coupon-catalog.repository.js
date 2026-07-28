'use strict';

const Coupon = require('../../../../models/couponModel.js');

async function findActiveCoupons(now) {
  return Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
  }).sort({ createdAt: -1 });
}

async function findRecentlyExpiredCoupons(now, thirtyDaysAgo) {
  return Coupon.find({
    isActive: true,
    validTo: {
      $gte: thirtyDaysAgo,
      $lt: now,
    },
  })
    .sort({ validTo: -1 })
    .limit(20);
}

module.exports = {
  findActiveCoupons,
  findRecentlyExpiredCoupons,
};

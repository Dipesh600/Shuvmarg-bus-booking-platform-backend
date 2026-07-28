'use strict';

const CouponUsage = require('../../../../../models/couponUsageModel');

function createCouponStatisticsRepository({
  CouponUsageModel = CouponUsage,
} = {}) {
  const aggregateCouponStatistics = async (couponId = null) => {
    let matchCondition = {};

    if (couponId) {
      matchCondition.couponId = couponId;
    }

    return CouponUsageModel.aggregate([
      {
        $match: matchCondition,
      },
      {
        $group: {
          _id: '$couponId',
          totalUsage: { $sum: 1 },
          totalDiscountGiven: { $sum: '$discountAmount' },
          totalOriginalAmount: { $sum: '$originalAmount' },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $lookup: {
          from: 'coupons',
          localField: '_id',
          foreignField: '_id',
          as: 'couponDetails',
        },
      },
      {
        $unwind: '$couponDetails',
      },
      {
        $project: {
          couponCode: '$couponDetails.couponCode',
          title: '$couponDetails.title',
          totalUsage: 1,
          totalDiscountGiven: 1,
          totalOriginalAmount: 1,
          uniqueUsersCount: { $size: '$uniqueUsers' },
          averageDiscount: {
            $divide: ['$totalDiscountGiven', '$totalUsage'],
          },
          conversionRate: {
            $multiply: [
              {
                $divide: [
                  '$totalDiscountGiven',
                  '$totalOriginalAmount',
                ],
              },
              100,
            ],
          },
        },
      },
    ]);
  };

  return {
    aggregateCouponStatistics,
  };
}

const defaultRepository = createCouponStatisticsRepository();

module.exports = {
  createCouponStatisticsRepository,
  aggregateCouponStatistics: defaultRepository.aggregateCouponStatistics,
};

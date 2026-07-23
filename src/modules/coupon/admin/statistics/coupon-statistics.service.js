'use strict';

const defaultRepository = require('./coupon-statistics.repository');

function createCouponStatisticsService({
  repository = defaultRepository,
} = {}) {
  const getCouponStats = async (couponId = null) => {
    try {
      return await repository.aggregateCouponStatistics(couponId);
    } catch (error) {
      throw new Error('Error fetching coupon statistics');
    }
  };

  return {
    getCouponStats,
  };
}

const defaultService = createCouponStatisticsService();

module.exports = {
  createCouponStatisticsService,
  getCouponStats: defaultService.getCouponStats,
};

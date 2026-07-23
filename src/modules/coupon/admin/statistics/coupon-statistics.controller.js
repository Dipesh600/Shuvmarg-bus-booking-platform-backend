'use strict';

const defaultService = require('./coupon-statistics.service');

function createCouponStatisticsController({
  service = defaultService,
} = {}) {
  const getCouponUsageStats = async (req, res) => {
    try {
      const stats = await service.getCouponStats();

      return res.status(200).json({
        success: true,
        message: 'Coupon usage statistics retrieved successfully!',
        data: stats,
      });
    } catch (error) {
      console.error('Error fetching coupon stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal Server Error!',
      });
    }
  };

  return {
    getCouponUsageStats,
  };
}

const defaultController = createCouponStatisticsController();

module.exports = {
  createCouponStatisticsController,
  getCouponUsageStats: defaultController.getCouponUsageStats,
};

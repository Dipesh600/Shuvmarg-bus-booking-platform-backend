'use strict';

const mongoose = require("mongoose");
const defaultRepository = require("./coupon-analytics.repository");
const defaultMapper = require("./coupon-analytics.mapper");

function createCouponAnalyticsController({
  repository = defaultRepository,
  mapper = defaultMapper,
  isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id),
} = {}) {
  return async function getCouponAnalytics(req, res) {
    try {
      const { id } = req.params;

      if (!id || !isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Valid Coupon ID is required!",
        });
      }

      const coupon = await repository.findCouponByIdWithCreators(id);

      if (!coupon) {
        return res.status(404).json({
          success: false,
          message: "Coupon not found!",
        });
      }

      const dailyUsage =
        await repository.aggregateDailyUsageByCouponId(id);

      const topUsers =
        await repository.aggregateTopUsersByCouponId(id);

      const usageLog =
        await repository.findLatestCouponUsageLogs(id);

      const summaryAgg =
        await repository.aggregateCouponSummaryByCouponId(id);

      const data = mapper.toCouponAnalyticsData({
        coupon,
        summaryAgg,
        dailyUsage,
        topUsers,
        usageLog,
      });

      return res.status(200).json({
        success: true,
        message: "Coupon analytics retrieved successfully!",
        data,
      });
    } catch (error) {
      console.error("Error fetching coupon analytics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

const getCouponAnalytics = createCouponAnalyticsController();

module.exports = {
  createCouponAnalyticsController,
  getCouponAnalytics,
};

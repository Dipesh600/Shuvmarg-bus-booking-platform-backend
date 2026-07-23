'use strict';

const defaultRepository = require('./coupon-catalog.repository.js');
const defaultMapper = require('./coupon-catalog.mapper.js');

function createCouponCatalogController({
  repository = defaultRepository,
  mapper = defaultMapper,
  nowFactory = () => new Date(),
} = {}) {
  const getAllCouponsForUser = async (req, res) => {
    try {
      const now = nowFactory();
      const coupons = await repository.findActiveCoupons(now);
      const results = await mapper.mapActiveCouponList(coupons);

      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.status(200).json({
        success: true,
        message: 'All coupons retrieved successfully!',
        data: results,
      });
    } catch (error) {
      console.error('Error fetching all coupons:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal Server Error!',
      });
    }
  };

  const getAllCouponsIncludingExpired = async (req, res) => {
    try {
      const now = nowFactory();
      const thirtyDaysAgo = nowFactory();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [activeCoupons, expiredCoupons] = await Promise.all([
        repository.findActiveCoupons(now),
        repository.findRecentlyExpiredCoupons(now, thirtyDaysAgo),
      ]);

      const [activeFormatted, expiredFormatted] = await Promise.all([
        mapper.mapCouponListIncludingStatus(activeCoupons),
        mapper.mapCouponListIncludingStatus(expiredCoupons),
      ]);

      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.status(200).json({
        success: true,
        message: 'All coupons retrieved successfully!',
        data: [...activeFormatted, ...expiredFormatted],
      });
    } catch (error) {
      console.error('Error fetching all coupons with expired:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal Server Error!',
      });
    }
  };

  return {
    getAllCouponsForUser,
    getAllCouponsIncludingExpired,
  };
}

const defaultController = createCouponCatalogController();

module.exports = {
  createCouponCatalogController,
  getAllCouponsForUser: defaultController.getAllCouponsForUser,
  getAllCouponsIncludingExpired: defaultController.getAllCouponsIncludingExpired,
};

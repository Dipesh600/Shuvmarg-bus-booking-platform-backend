"use strict";

function send(res, result) {
  return res.status(result.statusCode).json(result.body);
}

function createPassengerCouponController({
  availability,
  validateCoupon,
  getCouponHistory,
  searchCoupons,
  console,
}) {
  async function execute(res, label, operation) {
    try {
      return send(res, await operation());
    } catch (error) {
      console.error(label, error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  }

  return {
    getAvailableCoupons(req, res) {
      return execute(res, "Error fetching available coupons:", () =>
        availability.getAvailableCoupons({
          userId: req.userInfo.id,
          orderAmount: req.query.orderAmount,
          activeRole: req.userInfo.activeRole,
        })
      );
    },
    validateCoupon(req, res) {
      return execute(res, "Error validating coupon:", () =>
        validateCoupon({
          ...req.body,
          userId: req.userInfo.id,
          activeRole: req.userInfo.activeRole,
        })
      );
    },
    getMyCouponUsage(req, res) {
      return execute(res, "Error fetching coupon usage history:", () =>
        getCouponHistory({
          userId: req.userInfo.id,
          page: req.query.page,
          limit: req.query.limit,
        })
      );
    },
    getBestCoupon(req, res) {
      return execute(res, "Error finding best coupon:", () =>
        availability.getBestCoupon({
          userId: req.userInfo.id,
          orderAmount: req.query.orderAmount,
          scheduleId: req.query.scheduleId,
          activeRole: req.userInfo.activeRole,
        })
      );
    },
    searchCoupons(req, res) {
      return execute(res, "Error searching coupons:", () =>
        searchCoupons({
          userId: req.userInfo.id,
          query: req.query.query,
          orderAmount: req.query.orderAmount,
        })
      );
    },
  };
}

module.exports = { createPassengerCouponController };

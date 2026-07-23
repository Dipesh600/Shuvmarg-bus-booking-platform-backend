const express = require("express");
const adminMiddleware = require("../../../../middleware/adminMiddleware.js");
const couponController = require("../../../../controllers/adminController/coupon-controller/adminCouponController.js");
const { getCouponAnalytics } = require("./analytics");

const router = express.Router();

router.post("/coupons", adminMiddleware, couponController.createCoupon);
router.post(
  "/coupons/upload-image",
  adminMiddleware,
  couponController.uploadCouponImage
);
router.post(
  "/coupons/delete-image",
  adminMiddleware,
  couponController.deleteOrphanedCouponImage
);
router.get("/coupons", adminMiddleware, couponController.getAllCoupons);
router.get(
  "/coupons-stats",
  adminMiddleware,
  couponController.getCouponUsageStats
);
router.get(
  "/coupons/:id/analytics",
  adminMiddleware,
  getCouponAnalytics
);
router.get("/coupons/:id", adminMiddleware, couponController.getCouponById);
router.put("/coupons/:id", adminMiddleware, couponController.updateCoupon);
router.delete("/coupons/:id", adminMiddleware, couponController.deleteCoupon);
router.patch(
  "/coupons/:id/toggle-status",
  adminMiddleware,
  couponController.toggleCouponStatus
);

module.exports = router;

const express = require("express");
const router = express.Router();
const authCoontroller = require("../../controllers/authControllers.js/authController.js");
const auth = require("../../middleware/authMiddleware.js");
const autoGenerateReferralCode = require("../../middleware/autoGenerateReferralCode.js");
const userCouponController = require("../../controllers/couponController/userCouponController.js");
const recordCouponUsageController = require("../../controllers/couponController/recordCouponUsageController.js");

// New three-step registration process
router.post("/sendPhoneOTP", authCoontroller.sendPhoneOTP);
router.post("/verifyPhoneOTP", authCoontroller.verifyPhoneOTP);
router.post("/completeRegistration", authCoontroller.completeRegistration);

// Legacy routes (can be removed after testing)
// router.post("/register", authCoontroller.register);
// router.post("/registerNextStape", authCoontroller.registerNextStape);

router.post("/login", authCoontroller.login);
router.post("/verifyOtp", authCoontroller.verifyOtp);
router.post("/requestPasswordReset", authCoontroller.requestPasswordReset);
router.post("/verifyOtpForReset", authCoontroller.verifyOtpForReset);
router.post("/resetPassword", authCoontroller.resetPassword);
router.post("/resendOtp", authCoontroller.resendOtp);

// Update Profile picture
router.put(
  "/UpdateProfilePic",
  auth,
  autoGenerateReferralCode,
  authCoontroller.UpdateProfilePic
);

// Update User Profile (name, address, gender, and optionally profile picture)
router.patch(
  "/updateProfile",
  auth,
  autoGenerateReferralCode,
  authCoontroller.updateProfile
);

// Update Password
router.put("/updatePassword", auth, authCoontroller.updatePassword);

// Get User Detail
router.get("/getUserDetail", auth, authCoontroller.getUserDetail);

// Coupon Routes
router.get(
  "/coupons/all",
  userCouponController.getAllCouponsForUser
);
router.get(
  "/coupons/available",
  auth,
  userCouponController.getAvailableCoupons
);
router.post("/coupons/validate", auth, userCouponController.validateCoupon);
router.get(
  "/coupons/usage-history",
  auth,
  userCouponController.getMyCouponUsage
);
router.get("/coupons/best", auth, userCouponController.getBestCoupon);
router.get("/coupons/search", auth, userCouponController.searchCoupons);

// Coupon Usage Tracking Routes
router.post(
  "/coupons/record-usage",
  auth,
  recordCouponUsageController.recordCouponUsage
);
router.get(
  "/coupons/check-usage",
  auth,
  recordCouponUsageController.checkCouponUsage
);
router.get(
  "/coupons/my-used-coupons",
  auth,
  recordCouponUsageController.getUserUsedCoupons
);

module.exports = router;

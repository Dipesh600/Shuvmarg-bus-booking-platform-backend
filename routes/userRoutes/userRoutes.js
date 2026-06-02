const express = require("express");
const router = express.Router();
const authCoontroller = require("../../controllers/authControllers.js/authController.js");
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const autoGenerateReferralCode = require("../../middleware/autoGenerateReferralCode.js");
const userCouponController = require("../../controllers/couponController/userCouponController.js");
const recordCouponUsageController = require("../../controllers/couponController/recordCouponUsageController.js");
const otpRateLimiter = require("../../middleware/otpRateLimiter.js");
const rateLimit = require("express-rate-limit");

// Strict rate limiter for login attempts (per IP — 10 per 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── PUBLIC AUTH ROUTES (no JWT needed) ────────────────────────────────────────
// New three-step registration process
router.post("/sendPhoneOTP",       otpRateLimiter, authCoontroller.sendPhoneOTP);    // ← OTP rate limit
router.post("/verifyPhoneOTP",     authCoontroller.verifyPhoneOTP);
router.post("/completeRegistration", authCoontroller.completeRegistration);

router.post("/login",              loginLimiter, authCoontroller.login);              // ← Login rate limit
router.post("/verifyOtp",          authCoontroller.verifyOtp);
router.post("/requestPasswordReset", otpRateLimiter, authCoontroller.requestPasswordReset); // ← OTP rate limit
router.post("/verifyOtpForReset",  authCoontroller.verifyOtpForReset);
router.post("/resetPassword",      authCoontroller.resetPassword);
router.post("/resendOtp",          otpRateLimiter, authCoontroller.resendOtp);        // ← OTP rate limit

// Token management (refresh, logout, force password change)
router.post("/refresh",            authCoontroller.refreshAccessToken);               // ← No auth needed (uses refresh token)
router.post("/logout",             authCoontroller.logout);                            // ← No auth needed (uses refresh token)
router.post("/changeForcePassword", authCoontroller.changeForcePassword);              // ← Uses temp token

// ── PROTECTED ROUTES (JWT + DB verification) ─────────────────────────────────
// Update Profile picture
router.put(
  "/UpdateProfilePic",
  auth,
  verifyRoleFromDB,
  autoGenerateReferralCode,
  authCoontroller.UpdateProfilePic
);

// Update User Profile (name, address, gender, and optionally profile picture)
router.patch(
  "/updateProfile",
  auth,
  verifyRoleFromDB,
  autoGenerateReferralCode,
  authCoontroller.updateProfile
);

// Update Password
router.put("/updatePassword", auth, verifyRoleFromDB, authCoontroller.updatePassword);

// Get User Detail
router.get("/getUserDetail", auth, verifyRoleFromDB, authCoontroller.getUserDetail);

// Coupon Routes
router.get(
  "/coupons/all",
  userCouponController.getAllCouponsForUser          // active only → home carousel
);
router.get(
  "/coupons/all-with-expired",
  userCouponController.getAllCouponsIncludingExpired // active + expired → "See All" page
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

// Wallet Routes
const walletController = require("../../controllers/walletController/walletController.js");
const scratchCardController = require("../../controllers/walletController/scratchCardController.js");

router.get("/wallet/details", auth, verifyRoleFromDB, walletController.getWalletDetails);
router.post("/wallet/setup-pin", auth, verifyRoleFromDB, walletController.setupWalletPin);
router.post("/wallet/verify-pin", auth, verifyRoleFromDB, walletController.verifyWalletPin);

// Scratch Card Routes
router.get("/wallet/scratch-cards", auth, verifyRoleFromDB, scratchCardController.getScratchCards);
router.post("/wallet/scratch/:cardId", auth, verifyRoleFromDB, scratchCardController.scratchCard);

module.exports = router;

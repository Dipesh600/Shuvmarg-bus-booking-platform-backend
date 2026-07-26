const express = require("express");
const loginModule = require("../../src/modules/auth/login");
const registrationModule = require("../../src/modules/auth/registration");
const sessionController = require("../../src/modules/auth/session/index.js");
const passwordResetModule = require("../../src/modules/auth/password-reset");
const otpResendModule = require("../../src/modules/auth/otp-resend");
const forcePasswordModule = require("../../src/modules/auth/force-password");
const updatePasswordModule = require("../../src/modules/auth/update-password");
const profileModule = require("../../src/modules/auth/profile");
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const autoGenerateReferralCode = require("../../middleware/autoGenerateReferralCode.js");
const userCouponController = require("../../controllers/couponController/userCouponController.js");
const recordCouponUsageController = require("../../controllers/couponController/recordCouponUsageController.js");
const walletController = require("../../controllers/walletController/walletController.js");
const scratchCardController = require("../../controllers/walletController/scratchCardController.js");
const otpLimiters = require("../../middleware/otpRateLimiter.js");
const loginLimiters = require("../../middleware/loginRateLimiters.js");

const createUserRouter = ({
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
  loginRateLimiter = loginLimiters.loginRateLimiter,
  passwordChangeLimiter = loginLimiters.passwordChangeLimiter,
} = {}) => {
const router = express.Router();

// ── PUBLIC AUTH ROUTES (no JWT needed) ────────────────────────────────────────
// New three-step registration process
router.post("/sendPhoneOTP",       otpSendLimiter, otpPresenceLimiter, registrationModule.sendPhoneOTP);    // ← IP limit + phone-presence
router.post("/verifyPhoneOTP",     otpVerifyLimiter, registrationModule.verifyPhoneOTP); // ← phone-keyed verify limit
router.post("/completeRegistration", registrationModule.completeRegistration);

router.post("/login",              loginRateLimiter, loginModule.login);              // ← Login rate limit
// SECURITY: /verifyOtp (legacy) removed — no brute-force limit, plain === comparison, no purpose enforcement.
// Use verifyPhoneOTP for registration OTP verification.
router.post("/requestPasswordReset", otpSendLimiter, otpPresenceLimiter, passwordResetModule.requestPasswordReset); // ← IP limit + phone-presence
router.post("/verifyOtpForReset",  otpVerifyLimiter, passwordResetModule.verifyOtpForReset); // ← phone-keyed verify limit
router.post("/resetPassword",      otpVerifyLimiter, passwordResetModule.resetPassword);    // ← phone-keyed verify limit
router.post("/resendOtp",          otpSendLimiter, otpPresenceLimiter, otpResendModule.resendOtp);        // ← IP limit + phone-presence

// Token management (refresh, logout, force password change)
router.post("/refresh",            sessionController.refreshAccessToken);               // ← No auth needed (uses refresh token)
router.post("/logout",             sessionController.logout);                            // ← No auth needed (uses refresh token)
router.post(
  "/changeForcePassword",
  forcePasswordModule.changeForcePassword
);

// ── PROTECTED ROUTES (JWT + DB verification) ─────────────────────────────────
// Update Profile picture
router.put(
  "/UpdateProfilePic",
  auth,
  verifyRoleFromDB,
  autoGenerateReferralCode,
  profileModule.updateProfilePicture
);

// Update User Profile (name, address, gender, and optionally profile picture)
router.patch(
  "/updateProfile",
  auth,
  verifyRoleFromDB,
  autoGenerateReferralCode,
  profileModule.updateProfile
);

// Update Password
router.put("/updatePassword", auth, passwordChangeLimiter, verifyRoleFromDB, updatePasswordModule.updatePassword);

// Get User Detail
router.get("/getUserDetail", auth, verifyRoleFromDB, profileModule.getUserDetail);

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
  verifyRoleFromDB,
  userCouponController.getAvailableCoupons
);
router.post("/coupons/validate", auth, verifyRoleFromDB, userCouponController.validateCoupon);
router.get(
  "/coupons/usage-history",
  auth,
  verifyRoleFromDB,
  userCouponController.getMyCouponUsage
);
router.get("/coupons/best", auth, verifyRoleFromDB, userCouponController.getBestCoupon);
router.get("/coupons/search", auth, verifyRoleFromDB, userCouponController.searchCoupons);

// Coupon Usage Tracking Routes
router.post(
  "/coupons/record-usage",
  auth,
  verifyRoleFromDB,
  recordCouponUsageController.recordCouponUsage
);
router.get(
  "/coupons/check-usage",
  auth,
  verifyRoleFromDB,
  recordCouponUsageController.checkCouponUsage
);
router.get(
  "/coupons/my-used-coupons",
  auth,
  verifyRoleFromDB,
  recordCouponUsageController.getUserUsedCoupons
);

// Wallet Routes
router.get("/wallet/details", auth, verifyRoleFromDB, walletController.getWalletDetails);
router.post("/wallet/setup-pin", auth, verifyRoleFromDB, walletController.setupWalletPin);
router.post("/wallet/verify-pin", auth, verifyRoleFromDB, walletController.verifyWalletPin);

// Scratch Card Routes
router.get("/wallet/scratch-cards", auth, verifyRoleFromDB, scratchCardController.getScratchCards);
router.post("/wallet/scratch/:cardId", auth, verifyRoleFromDB, scratchCardController.scratchCard);

return router;
};

module.exports = createUserRouter();
module.exports.createUserRouter = createUserRouter;

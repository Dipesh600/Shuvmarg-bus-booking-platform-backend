const express = require("express");
const router = express.Router();
const referralController = require("../../controllers/referralController/referralController.js");
const auth = require("../../middleware/authMiddleware.js");
const { adminMiddleware } = require("../../middleware/checkRole.js");
const autoGenerateReferralCode = require("../../middleware/autoGenerateReferralCode.js");

// Generate referral code for authenticated user
router.post("/generateCode", auth, autoGenerateReferralCode, referralController.generateMyReferralCode);

// Ensure user has referral code (check and generate if needed)
router.get("/ensureCode", auth, autoGenerateReferralCode, referralController.ensureReferralCode);

// Apply referral code during registration
router.post("/applyCode", referralController.applyReferralCode);

// Get user's referral statistics
router.get("/myStats", auth, autoGenerateReferralCode, referralController.getMyReferralStats);

// Referral dashboard (code usage count, total points, separate referrals list, and user's code)
router.get("/dashboard", auth, autoGenerateReferralCode, referralController.getReferralDashboard);

// Validate referral code (public endpoint)
router.post("/validateCode", referralController.validateReferralCodeEndpoint);

// Get all referral codes (Admin only)
router.get("/allCodes", auth, adminMiddleware, referralController.getAllReferralCodes);

// Get user's referral history with points earned
router.get("/history", auth, referralController.getReferralHistory);

// Add referrer points to yatrapoints
router.post("/addPointsToYatra", auth, referralController.addReferrerPointsToYatraPoints);

module.exports = router; 
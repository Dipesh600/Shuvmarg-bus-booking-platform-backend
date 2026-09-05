const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const express = require("express");
const router = express.Router();
const referralController = require("../../controllers/referralController/referralController.js");
const auth = require("../../middleware/authMiddleware.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const autoGenerateReferralCode = require("../../middleware/autoGenerateReferralCode.js");

// ═══════════════════════════════════════════════════════════════════════
// CODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// Generate referral code for authenticated user
router.post("/generateCode", auth, verifyRoleFromDB, autoGenerateReferralCode, referralController.generateMyReferralCode);

// Ensure user has referral code (check and generate if needed)
router.get("/ensureCode", auth, verifyRoleFromDB, autoGenerateReferralCode, referralController.ensureReferralCode);

// Validate referral code format and existence (public endpoint)
router.post("/validateCode", referralController.validateReferralCodeEndpoint);

// ═══════════════════════════════════════════════════════════════════════
// V2: APPLY CODE (Progressive Unlock)
// ═══════════════════════════════════════════════════════════════════════

// Apply referral code during or after registration
router.post("/applyCode", auth, verifyRoleFromDB, referralController.applyReferralCode);

// ═══════════════════════════════════════════════════════════════════════
// V2: DASHBOARD & HISTORY
// ═══════════════════════════════════════════════════════════════════════

// Referral dashboard with progressive unlock stats
router.get("/dashboard", auth, verifyRoleFromDB, autoGenerateReferralCode, referralController.getReferralDashboard);

// Referral history with per-referral unlock timeline
router.get("/history", auth, verifyRoleFromDB, referralController.getReferralHistory);

// ═══════════════════════════════════════════════════════════════════════
// ADMIN (SuperAdmin JWT — not User JWT)
// ═══════════════════════════════════════════════════════════════════════

// Get all referral codes (Admin only)
router.get("/allCodes", adminMiddleware, referralController.getAllReferralCodes);

// Legacy routes — kept for backward compatibility, redirect to dashboard
// /myStats → now served by /dashboard
router.get("/myStats", auth, verifyRoleFromDB, autoGenerateReferralCode, referralController.getReferralDashboard);

module.exports = router;

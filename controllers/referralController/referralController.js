const User = require("../../models/userModel.js");
const {
  generateReferralCode,
  validateReferralCode,
} = require("../../handlers/referralCodeGenerator.js");
const referralV2Service = require("../../services/referralV2Service.js");

/**
 * Referral Controller — V2 (Progressive Unlock)
 *
 * SPEC REFERENCE: shuvmarg-money-spec.md §3
 *
 * All business logic is delegated to referralV2Service.js.
 * This controller handles HTTP concerns only: request parsing,
 * response formatting, and error mapping.
 *
 * BACKWARD COMPATIBILITY:
 *   - Same route paths (/api/referral/*)
 *   - Response shapes updated to include V2 fields (locked/unlocked/progress)
 *   - Old ReferralHistory model is NOT queried — all data comes from ReferralV2
 */

// ═══════════════════════════════════════════════════════════════════════
// CODE MANAGEMENT (unchanged logic, now passes user name for branded codes)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/referral/generateCode
 * Generate referral code for authenticated user.
 */
const generateMyReferralCode = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Check if user already has a referral code
    if (user.referralCode) {
      return res.status(200).json({
        status: true,
        message: "Referral code already exists",
        data: {
          referralCode: user.referralCode,
        },
      });
    }

    // Generate branded referral code (SHUV-XXX##)
    const referralCode = await generateReferralCode(user.name);
    user.referralCode = referralCode;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Referral code generated successfully",
      data: {
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Generate Referral Code Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * GET /api/referral/ensureCode
 * Check and generate referral code if needed.
 */
const ensureReferralCode = async (req, res) => {
  try {
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Generate referral code if user doesn't have one
    if (!user.referralCode) {
      const referralCode = await generateReferralCode(user.name);
      user.referralCode = referralCode;
      await user.save();

      return res.status(200).json({
        status: true,
        message: "Referral code generated successfully",
        data: {
          referralCode: user.referralCode,
          wasGenerated: true,
        },
      });
    }

    // User already has referral code
    return res.status(200).json({
      status: true,
      message: "User already has referral code",
      data: {
        referralCode: user.referralCode,
        wasGenerated: false,
      },
    });
  } catch (error) {
    console.error("Ensure Referral Code Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * POST /api/referral/validateCode
 * Validate referral code format and existence (public endpoint).
 */
const validateReferralCodeEndpoint = async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        status: false,
        message: "Referral code is required",
      });
    }

    // Validate format (accepts both old and new branded format)
    if (!validateReferralCode(referralCode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid referral code format",
      });
    }

    // Check if code exists
    const user = await User.findOne({
      referralCode: referralCode.trim().toUpperCase(),
    }).select("name");
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Invalid referral code",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Valid referral code",
      data: {
        referrerName: user.name,
      },
    });
  } catch (error) {
    console.error("Validate Referral Code Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// V2: APPLY REFERRAL CODE (Progressive Unlock)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/referral/applyCode
 *
 * Apply a referral code during or after registration.
 * Delegates to referralV2Service.createReferral() which:
 *   1. Validates all rules (self-refer, 24h window, first journey, etc.)
 *   2. Creates ReferralV2 document
 *   3. Creates REFERRAL_LOCKED ledger entry (NPR 100)
 *   4. Tags the referred user with referredBy
 *   5. Runs fraud detection (async)
 *   6. Sends notification to referrer (async)
 */
const applyReferralCode = async (req, res) => {
  try {
    const { referralCode, userId } = req.body;

    if (!referralCode || !userId) {
      return res.status(400).json({
        status: false,
        message: "Referral code and user ID are required",
      });
    }

    // Validate format
    if (!validateReferralCode(referralCode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid referral code format",
      });
    }

    // Find referrer by code
    const referrer = await User.findOne({
      referralCode: referralCode.trim().toUpperCase(),
    });
    if (!referrer) {
      return res.status(404).json({
        status: false,
        message: "Invalid referral code",
      });
    }

    // Delegate to V2 service — all validation happens inside
    const referral = await referralV2Service.createReferral({
      referrerId: referrer._id,
      referredUserId: userId,
      referralCode: referralCode.trim().toUpperCase(),
      ipAddress: req.ip || req.headers["x-forwarded-for"] || null,
      deviceInfo: req.headers["user-agent"] || null,
    });

    return res.status(200).json({
      status: true,
      message: "Referral code applied successfully",
      data: {
        referrerName: referrer.name,
        lockedReward: referralV2Service.TOTAL_REFERRAL_REWARD,
        referralStatus: referral.status,
      },
    });
  } catch (error) {
    console.error("Apply Referral Code Error:", error);

    // Map service errors to HTTP status codes
    const clientErrors = [
      "You cannot refer yourself",
      "This user already has a referral code applied",
      "Referral code can only be applied within 24 hours",
      "Referral code can't be applied after your first trip",
    ];

    const isClientError = clientErrors.some((msg) =>
      error.message.includes(msg)
    );

    return res.status(isClientError ? 400 : 500).json({
      status: false,
      message: isClientError ? error.message : "Internal server error",
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════
// V2: DASHBOARD & HISTORY
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/referral/dashboard
 *
 * Returns the referrer's full referral dashboard:
 *   - Their referral code
 *   - Summary stats (total, active, unlocked, expired, total earned, total locked)
 *   - Per-referral breakdown with journey progress
 */
const getReferralDashboard = async (req, res) => {
  try {
    if (!req.userInfo || !req.userInfo.id) {
      return res.status(401).json({
        status: false,
        message: "Authentication required. Please log in.",
      });
    }

    const userId = req.userInfo.id;
    const dashboard = await referralV2Service.getReferralDashboard(userId);

    return res.status(200).json({
      status: true,
      message: "Referral dashboard data",
      data: dashboard,
    });
  } catch (err) {
    console.error("Error fetching referral dashboard:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch referral dashboard",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * GET /api/referral/history
 *
 * Returns the referrer's referral history with per-referral unlock details.
 * Similar to dashboard but focused on the timeline of events.
 */
const getReferralHistory = async (req, res) => {
  try {
    if (!req.userInfo || !req.userInfo.id) {
      return res.status(401).json({
        status: false,
        message: "Authentication required. Please log in.",
      });
    }

    const userId = req.userInfo.id;
    const dashboard = await referralV2Service.getReferralDashboard(userId);

    // Transform into a timeline-focused response
    const history = dashboard.referrals.map((referral) => ({
      id: referral.id,
      referredUser: referral.referredUser,
      status: referral.status,
      journeysCompleted: referral.journeysCompleted,
      totalUnlocked: referral.totalUnlocked,
      lockedRemaining: referral.lockedRemaining,
      unlockHistory: referral.unlockHistory,
      expiresAt: referral.expiresAt,
      createdAt: referral.createdAt,
    }));

    return res.status(200).json({
      status: true,
      message: "Successfully fetched referral history!",
      data: history,
    });
  } catch (err) {
    console.error("Error fetching referral history:", err);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch referral history",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * GET /api/referral/allCodes (Admin only)
 * Get all referral codes with V2 stats.
 */
const getAllReferralCodes = async (req, res) => {
  try {
    const users = await User.find({
      referralCode: { $exists: true, $ne: null },
    })
      .select("name email phone referralCode totalReferrals createdAt")
      .sort({ totalReferrals: -1 });

    return res.status(200).json({
      status: true,
      message: "Referral codes retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error("Get All Referral Codes Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  generateMyReferralCode,
  applyReferralCode,
  getReferralDashboard,
  getAllReferralCodes,
  validateReferralCodeEndpoint,
  ensureReferralCode,
  getReferralHistory,
};

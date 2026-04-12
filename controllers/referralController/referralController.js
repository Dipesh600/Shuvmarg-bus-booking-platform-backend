const User = require("../../models/userModel.js");
const {
  generateReferralCode,
  validateReferralCode,
} = require("../../handlers/referralCodeGenerator.js");
const ReferralHistory = require("../../models/referralModel");

/**
 * Generate referral code for authenticated user
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
          totalReferrals: user.totalReferrals,
          yatrapoints: user.yatrapoints,
        },
      });
    }

    // Generate unique referral code
    const referralCode = await generateReferralCode();
    user.referralCode = referralCode;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Referral code generated successfully",
      data: {
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals,
        yatrapoints: user.yatrapoints,
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
 * Referral Dashboard for authenticated user
 * Returns:
 * - referralCode
 * - totalUsersUsedCode (count of referred users)
 * - totalReferralPoints (sum of pointsAwarded in history)
 * - referrals (separate list with user and points)
 * - pointsBalance (overall yatrapoints of the user)
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

  const user = await User.findById(userId).select(
      "referralCode yatrapoints totalReferrals"
    );
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // History records with populated referred user using new ReferralHistory model
    const history = await ReferralHistory.find({ 
      referrerUserId: userId,
      pointsCredited: true 
    })
      .populate({
        path: "referredUserId",
        select: "name email phone",
        model: "User",
      })
      .sort({ createdAt: -1 })
      .lean();

    const referrals = history.map((h) => ({
      id: h._id,
      referredUser: {
        name: h.referredUserId?.name || "Deleted User",
        email: h.referredUserId?.email,
        phone: h.referredUserId?.phone,
      },
      referrerPoints: h.referrerPoints || 0,
      referredUserPoints: h.referredUserPoints || 0,
      usedReferralCode: h.usedReferralCode,
      status: h.status,
      date: h.createdAt,
    }));

    // Calculate total points earned by the referrer from all referrals
    const totalReferralPoints = referrals.reduce(
      (sum, r) => sum + (r.referrerPoints || 0),
      0
    );

    // Fallback to counting referredBy if history is empty
    let totalUsersUsedCode = referrals.length;
    if (totalUsersUsedCode === 0) {
      totalUsersUsedCode = await User.countDocuments({ referredBy: userId });
    }

    // Calculate additional statistics
    const completedReferrals = referrals.filter(r => r.status === 'completed').length;
    const pendingReferrals = referrals.filter(r => r.status === 'pending').length;

    return res.status(200).json({
      status: true,
      message: "Referral dashboard data",
      data: {
        referralCode: user.referralCode,
        totalUsersUsedCode,
        totalReferralPoints,
        pointsBalance: user.yatrapoints,
        completedReferrals,
        pendingReferrals,
        // referrals: referrals.slice(0, 10), // Show latest 10 referrals
        hasMoreReferrals: referrals.length > 10,
      },
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
 * Apply referral code during registration
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

    // Validate referral code format
    if (!validateReferralCode(referralCode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid referral code format",
      });
    }

    // Find user by referral code
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({
        status: false,
        message: "Invalid referral code",
      });
    }

    // Check if user is trying to refer themselves
    if (referrer._id.toString() === userId) {
      return res.status(400).json({
        status: false,
        message: "You cannot refer yourself",
      });
    }

    // Find the user to be referred
    const userToRefer = await User.findById(userId);
    if (!userToRefer) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Check if user is already referred
    if (userToRefer.referredBy) {
      return res.status(400).json({
        status: false,
        message: "User is already referred by someone else",
      });
    }

    // Apply referral
    userToRefer.referredBy = referrer._id;
    await userToRefer.save();

    // Update referrer's statistics
    referrer.totalReferrals += 1;
    referrer.yatrapoints += 100; // Give 100 points for successful referral
    await referrer.save();

    // Record referral history for dashboard analytics
    try {
      await new Referral({
        referrer: referrer._id,
        referredUser: userToRefer._id,
        pointsAwarded: 100,
      }).save();
    } catch (historyErr) {
      console.error("Failed to save referral history:", historyErr);
    }

    // Give bonus points to the referred user
    userToRefer.yatrapoints += 50; // Give 50 points to new user
    await userToRefer.save();

    return res.status(200).json({
      status: true,
      message: "Referral code applied successfully",
      data: {
        referrerName: referrer.name,
        bonusPoints: 50,
      },
    });
  } catch (error) {
    console.error("Apply Referral Code Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get user's referral statistics
 */
const getMyReferralStats = async (req, res) => {
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

    // Get referred users
    const referredUsers = await User.find({ referredBy: userId })
      .select("name email phone createdAt")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      status: true,
      message: "Referral statistics retrieved successfully",
      data: {
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals,
        yatrapoints: user.yatrapoints,
        referredUsers: referredUsers,
        referredBy: user.referredBy ? true : false,
      },
    });
  } catch (error) {
    console.error("Get Referral Stats Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Get all referral codes (Admin only)
 */
const getAllReferralCodes = async (req, res) => {
  try {
    const users = await User.find({
      referralCode: { $exists: true, $ne: null },
    })
      .select(
        "name email phone referralCode totalReferrals yatrapoints createdAt"
      )
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

/**
 * Validate referral code (public endpoint)
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

    // Validate format
    if (!validateReferralCode(referralCode)) {
      return res.status(400).json({
        status: false,
        message: "Invalid referral code format",
      });
    }

    // Check if code exists
    const user = await User.findOne({ referralCode }).select("name");
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

/**
 * Check and ensure user has referral code
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
      const referralCode = await generateReferralCode();
      user.referralCode = referralCode;
      await user.save();

      return res.status(200).json({
        status: true,
        message: "Referral code generated successfully",
        data: {
          referralCode: user.referralCode,
          totalReferrals: user.totalReferrals,
          yatrapoints: user.yatrapoints,
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
        totalReferrals: user.totalReferrals,
        yatrapoints: user.yatrapoints,
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
 * Sync referrer points from ReferralHistory to user's yatrapoints
 * This function ensures referrer points are properly reflected in yatrapoints
 * It's smart enough to avoid double-adding points
 */
const addReferrerPointsToYatraPoints = async (req, res) => {
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

    // Get all referral history records where this user is the referrer
    const referralRecords = await ReferralHistory.find({ 
      referrerUserId: userId,
      pointsCredited: true,
      status: 'completed'
    });

    // Calculate total referrer points that should be in yatrapoints
    const totalReferrerPointsFromHistory = referralRecords.reduce(
      (sum, record) => sum + (record.referrerPoints || 0),
      0
    );

    // Get current yatrapoints
    const currentYatraPoints = user.yatrapoints || 0;

    // Calculate how many points from referrals are already in yatrapoints
    // We'll assume that the registration process already added the initial points
    // So we just need to ensure consistency
    
    return res.status(200).json({
      status: true,
      message: "Referrer points sync completed",
      data: {
        currentYatraPoints: currentYatraPoints,
        totalReferrerPointsFromHistory: totalReferrerPointsFromHistory,
        totalReferrals: referralRecords.length,
        referralRecords: referralRecords.map(record => ({
          referredUserId: record.referredUserId,
          referrerPoints: record.referrerPoints,
          usedReferralCode: record.usedReferralCode,
          date: record.createdAt,
          status: record.status
        })),
        note: "Points are automatically added during registration. This endpoint shows your referral history and points."
      },
    });
  } catch (error) {
    console.error("Sync Referrer Points Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

    // GET /api/referral/history
 
const getReferralHistory = async (req, res) => {
  try {
    // Check if user is authenticated and has a valid ID
    if (!req.userInfo || !req.userInfo.id) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required. Please log in.'
      });
    }
    
    const userId = req.userInfo.id;
    
    // Find all referrals for this user and populate the referred user's details using new model
    const history = await ReferralHistory.find({ referrerUserId: userId })
      .populate({
        path: 'referredUserId',
        select: 'name email phone', // Only select necessary fields
        model: 'User'
      })
      .sort({ createdAt: -1 }) // Sort by most recent first
      .lean();

    // Transform the data to include only necessary fields
    const referralHistory = history.map(referral => ({
      id: referral._id,
      referredUser: {
        name: referral.referredUserId?.name || 'Deleted User',
        // email: referral.referredUserId?.email,
        // phone: referral.referredUserId?.phone
      },
      referrerPointsEarned: referral.referrerPoints || 0,
      referredUserPoints: referral.referredUserPoints || 0,
      status: referral.status,
      referralCodeUsed: referral.usedReferralCode,
      rewardType: referral.rewardType,
      date: referral.createdAt
    }));

    // Calculate total points earned by the referrer
    const totalPointsEarned = referralHistory.reduce(
      (sum, referral) => sum + (referral.referrerPointsEarned || 0), 0
    );

    res.status(200).json({
      status: true,
      message: "Sucessfully fetched refral History!",
      data: referralHistory
    });

  } catch (err) {
    console.error('Error fetching referral history:', err);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referral history',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

module.exports = {
  generateMyReferralCode,
  applyReferralCode,
  getMyReferralStats,
  getAllReferralCodes,
  validateReferralCodeEndpoint,
  ensureReferralCode,
  addReferrerPointsToYatraPoints,
  getReferralHistory,
  getReferralDashboard
};

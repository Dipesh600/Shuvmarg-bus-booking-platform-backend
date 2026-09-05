'use strict';
const User = require('../../../../models/userModel');
const { validateReferralCode } = require('../../../../handlers/referralCodeGenerator');
const referralRewardService = require('./index');

const applyReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userId = req.userInfo?.id;
    if (!userId) {
      return res.status(401).json({ status: false, message: "Authentication required. Please log in." });
    }
    if (req.body.userId !== undefined && req.body.userId !== String(userId)) {
      return res.status(403).json({ status: false, message: "You can only apply a referral code to your own account." });
    }

    if (typeof referralCode !== 'string' || !referralCode) {
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
    const referral = await referralRewardService.createReferral({
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
        lockedReward: referralRewardService.TOTAL_REFERRAL_REWARD,
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

module.exports = { applyReferralCode };

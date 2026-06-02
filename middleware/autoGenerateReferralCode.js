const User = require("../models/userModel.js");
const { generateReferralCode } = require("../handlers/referralCodeGenerator.js");

/**
 * Middleware to automatically generate referral code for users who don't have one
 * This ensures all users have referral codes without manual intervention
 */
const autoGenerateReferralCode = async (req, res, next) => {
  try {
    // Only run for authenticated users
    if (!req.userInfo?.id) {
      return next();
    }

    const userId = req.userInfo.id;
    const user = await User.findById(userId);

    if (!user) {
      return next();
    }

    // Generate referral code if user doesn't have one
    if (!user.referralCode) {
      try {
        const referralCode = await generateReferralCode(user.name);
        user.referralCode = referralCode;
        await user.save();
        
        console.log(`Auto-generated referral code ${referralCode} for user: ${user.name || user.phone}`);
      } catch (error) {
        console.error(`Error auto-generating referral code for user ${user.name || user.phone}:`, error.message);
        // Don't block the request if referral code generation fails
      }
    }

    next();
  } catch (error) {
    console.error("Auto-generate referral code middleware error:", error);
    // Don't block the request if middleware fails
    next();
  }
};

module.exports = autoGenerateReferralCode; 
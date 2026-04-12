const User = require("../models/userModel.js");

/**
 * Generate a unique referral code
 * @returns {Promise<string>} Unique referral code
 */
const generateReferralCode = async () => {
  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    code = generateCode();
    const existingUser = await User.findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Unable to generate unique referral code after multiple attempts');
  }

  return code;
};

/**
 * Validate referral code format
 * @param {string} code - Referral code to validate
 * @returns {boolean} True if valid format
 */
const validateReferralCode = (code) => {
  if (!code || typeof code !== 'string') {
    return false;
  }
  // Check if code is 8 characters long and contains only uppercase letters and numbers
  const codeRegex = /^[A-Z0-9]{8}$/;
  return codeRegex.test(code);
};

module.exports = {
  generateReferralCode,
  validateReferralCode
}; 
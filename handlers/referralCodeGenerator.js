const User = require("../models/userModel.js");

/**
 * Branded Referral Code Generator — Shuvmarg V2
 *
 * SPEC REFERENCE: shuvmarg-money-spec.md §3.3
 *
 * Format: SHUV-{3_LETTERS}{2_DIGITS}
 * Examples: SHUV-DIP42, SHUV-RAM07, SHUV-ANK93
 *
 * The 3-letter portion is derived from the user's name when available,
 * otherwise random uppercase letters. The 2-digit portion is always random.
 * Total: 10 characters including the hyphen.
 *
 * Backward compatibility:
 *   - Old codes (random 8-char alphanumeric like "X7KJ2M9P") remain valid
 *   - validateReferralCode() accepts BOTH old and new formats
 *   - Only generateReferralCode() now produces the branded format
 */

/**
 * Generate a branded referral code: SHUV-{3_LETTERS}{2_DIGITS}
 *
 * @param {String} [userName] — user's name, used to seed the 3-letter portion
 * @returns {Promise<string>} Unique referral code
 */
const generateReferralCode = async (userName = null) => {
  const generateCode = (name) => {
    // Extract up to 3 uppercase letters from the user's name
    let prefix = "";
    if (name && typeof name === "string") {
      // Strip non-alpha, take first 3 chars, uppercase
      const cleaned = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
      prefix = cleaned.slice(0, 3);
    }

    // Pad with random letters if name didn't yield 3 characters
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    while (prefix.length < 3) {
      prefix += letters.charAt(Math.floor(Math.random() * letters.length));
    }

    // Generate 2 random digits
    const digits = String(Math.floor(Math.random() * 100)).padStart(2, "0");

    return `SHUV-${prefix}${digits}`;
  };

  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 20; // More attempts since the code space is smaller

  while (!isUnique && attempts < maxAttempts) {
    code = generateCode(userName);
    const existingUser = await User.findOne({ referralCode: code });
    if (!existingUser) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error(
      "Unable to generate unique referral code after multiple attempts"
    );
  }

  return code;
};

/**
 * Validate referral code format.
 * Accepts BOTH the old format (8-char alphanumeric) and the new branded format.
 *
 * Old: /^[A-Z0-9]{8}$/           → e.g. "X7KJ2M9P"
 * New: /^SHUV-[A-Z]{3}[0-9]{2}$/ → e.g. "SHUV-DIP42"
 *
 * @param {string} code - Referral code to validate
 * @returns {boolean} True if valid format
 */
const validateReferralCode = (code) => {
  if (!code || typeof code !== "string") {
    return false;
  }

  const trimmed = code.trim().toUpperCase();

  // New branded format: SHUV-XXX## (10 chars)
  const newFormat = /^SHUV-[A-Z]{3}[0-9]{2}$/;
  if (newFormat.test(trimmed)) return true;

  // Legacy format: 8-char alphanumeric (backward compatibility)
  const oldFormat = /^[A-Z0-9]{8}$/;
  if (oldFormat.test(trimmed)) return true;

  return false;
};

module.exports = {
  generateReferralCode,
  validateReferralCode,
};
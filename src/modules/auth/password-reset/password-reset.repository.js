'use strict';

const User = require('../../../../models/userModel');

/**
 * Find user for requestPasswordReset.
 * Legacy query: no deletedAt filter.
 */
const findForResetRequest = (emailOrPhone, normalizedPhone) =>
  User.findOne({
    $or: [
      { email: emailOrPhone },
      { phone: normalizedPhone },
      { phone: emailOrPhone },
    ],
  });

/**
 * Find active user after OTP peek (verifyOtpForReset).
 */
const findActiveAfterOtpVerification = (phone, emailOrPhone) =>
  User.findOne({
    $or: [{ phone }, { email: emailOrPhone }],
    deletedAt: null,
  });

/**
 * Find active user with password selected (resetPassword).
 */
const findActiveForPasswordReset = (emailOrPhone, normalizedPhone) =>
  User.findOne({
    $or: [
      { phone: normalizedPhone },
      { phone: emailOrPhone },
      { email: emailOrPhone },
    ],
    deletedAt: null,
  }).select('+password');

/**
 * Persist a new hashed password and save.
 */
const savePassword = async (user, hashedPassword) => {
  user.password = hashedPassword;
  return user.save();
};

/**
 * Increment tokenVersion by 1 to invalidate live access tokens.
 */
const incrementTokenVersion = (userId) =>
  User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });

module.exports = {
  findForResetRequest,
  findActiveAfterOtpVerification,
  findActiveForPasswordReset,
  savePassword,
  incrementTokenVersion,
};

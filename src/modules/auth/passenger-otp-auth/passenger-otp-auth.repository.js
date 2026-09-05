'use strict';

/**
 * src/modules/auth/passenger-otp-auth/passenger-otp-auth.repository.js
 *
 * Data-access functions for the passenger OTP authentication flow.
 *
 * Security contract:
 *   loadPassengerSessionState() selects +password internally to derive
 *   hasUsablePassword, then deletes the hash from the returned object.
 *   The raw bcrypt hash NEVER leaves this module.
 */

const User = require('../../../../models/userModel');
const { buildPhoneQuery } = require('../../../../utils/phoneGuard');

// Fields returned as session state (excluding password — removed before return)
const SESSION_FIELDS =
  'role roles status deletedAt phoneVerified name email phone profilePicture forcePasswordChange tokenVersion';

/**
 * Lightweight account-eligibility lookup for the OTP request flow.
 * Includes soft-deleted accounts so ineligible records are always found.
 * Does NOT select password.
 *
 * @param {string} rawPhone - Raw phone string as supplied by caller
 * @returns {Promise<{ status: string, deletedAt: Date|null }|null>}
 */
const findPassengerOtpEligibilityByPhone = (rawPhone) =>
  User.findOne(buildPhoneQuery(rawPhone, { includeDeleted: true }))
    .select('status deletedAt')
    .lean();

/**
 * Load full session state for a passenger login.
 *
 * Internally selects +password to determine hasUsablePassword, then
 * removes the hash before returning. Returns null when the user is not found.
 *
 * @param {string} userId
 * @returns {Promise<{ user: Object, hasUsablePassword: boolean }|null>}
 */
const loadPassengerSessionState = async (userId) => {
  const raw = await User.findById(userId)
    .select(`+password ${SESSION_FIELDS}`)
    .lean();
  if (!raw) return null;
  const hasUsablePassword = !!(raw.password && raw.password.length > 0);
  delete raw.password;
  return { user: raw, hasUsablePassword };
};

/**
 * Record a successful OTP login.
 * Clears failed-attempt counters and sets lastLoginAt.
 *
 * @param {string} userId
 * @param {Date}   now
 */
const recordPassengerLogin = (userId, now) =>
  User.findByIdAndUpdate(userId, {
    $set: { lastLoginAt: now, failedLoginAttempts: 0, lockedUntil: null },
  });

/**
 * Atomically add 'passenger' to roles[] for legacy accounts where
 * role:'passenger' but roles is missing (pre-multi-role documents).
 *
 * Does NOT touch roleActivatedAt.passenger or the historical `role` field.
 *
 * @param {string} userId
 */
const materializeLegacyPassengerRole = (userId) =>
  User.findOneAndUpdate(
    { _id: userId, roles: { $exists: false }, role: 'passenger', deletedAt: null,
      status: { $nin: ['banned', 'inactive', 'invited'] } },
    { $addToSet: { roles: 'passenger' } },
  );

module.exports = {
  findPassengerOtpEligibilityByPhone,
  loadPassengerSessionState,
  recordPassengerLogin,
  materializeLegacyPassengerRole,
};

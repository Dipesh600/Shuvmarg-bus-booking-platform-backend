'use strict';

/**
 * src/modules/auth/passenger-otp-auth/passenger-otp-auth.policy.js
 *
 * Pure decision helpers for the passenger OTP authentication flow.
 * No database access, no model imports, no side effects.
 */

const PASSENGER_AUTH_PURPOSE = 'PASSENGER_AUTH';

/**
 * SMS prefix for passenger authentication OTPs.
 * Passed as customPrefix to createAndSendOTP.
 */
const PASSENGER_AUTH_SMS_PREFIX = 'Your Shuv Marg Login code is';

const NEPAL_MOBILE_RE = /^(97|98)\d{8}$/;

/** Account statuses that are permanently ineligible for OTP authentication. */
const RESTRICTED_STATUSES = ['banned', 'inactive', 'invited'];

const isValidNepalMobile = (phone) => NEPAL_MOBILE_RE.test(phone);

const cleanOtp = (otp) => String(otp).replace(/\D/g, '');

const isSixDigitOtp = (otp) => otp.length === 6;

/**
 * Return true when the user record is ineligible to receive an OTP.
 * Includes soft-deleted accounts (deletedAt present) and restricted statuses.
 */
const isEligibilityRestricted = (user) => {
  if (!user) return false;
  if (user.deletedAt) return true;
  return RESTRICTED_STATUSES.includes(user.status);
};

// ── OTP send-error helpers ─────────────────────────────────────────────────

/** OTP_SEND_BLOCKED:<minutes> — thrown by otpHelper when send-count exhausted */
const isOtpBlocked = (err) =>
  Boolean(err && err.message && err.message.startsWith('OTP_SEND_BLOCKED:'));

const otpBlockedMinutes = (err) =>
  parseInt(String(err.message).split(':')[1], 10) || 10;

/** OTP_COOLDOWN:<seconds> — thrown by otpHelper during 60-second cooldown window */
const isOtpCooldown = (err) =>
  Boolean(err && err.message && err.message.startsWith('OTP_COOLDOWN:'));

const otpCooldownSeconds = (err) =>
  parseInt(String(err.message).split(':')[1], 10) || 60;

/** Sparrow SMS Gateway Error — thrown by sparro-otp.js on any delivery failure */
const isSparrowSmsError = (err) =>
  Boolean(err && err.message && err.message.startsWith('Sparrow SMS Gateway Error:'));

module.exports = {
  PASSENGER_AUTH_PURPOSE,
  PASSENGER_AUTH_SMS_PREFIX,
  RESTRICTED_STATUSES,
  isValidNepalMobile,
  cleanOtp,
  isSixDigitOtp,
  isEligibilityRestricted,
  isOtpBlocked,
  otpBlockedMinutes,
  isOtpCooldown,
  otpCooldownSeconds,
  isSparrowSmsError,
};

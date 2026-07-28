'use strict';

/**
 * src/modules/auth/passenger-otp-auth/verify-passenger-otp.service.js
 *
 * Verifies a passenger authentication OTP and issues a session.
 *
 * Sequence:
 *   1. Validate inputs
 *   2. Normalize phone + sanitize OTP
 *   3. Verify PASSENGER_AUTH OTP (atomic, one-time consumption)
 *   4. Resolve passenger account (new / existing-no-role / existing-with-role)
 *   5. Load latest session state (with password-presence check)
 *   6. Derive effective roles and materialize legacy passenger role if needed
 *   7. Reload state after any role repair
 *   8. Enforce current account restrictions (deleted, banned, inactive, invited)
 *   9. Enforce forcePasswordChange gate
 *  10. Record successful login
 *  11. Generate token pair (activeRole: 'passenger')
 *  12. Return 200 with safe user response
 */

const { normalizePhone } = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const tokenService = require('../../../../utils/tokenService');
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');
const passengerAccount = require('../passenger-account');
const repository = require('./passenger-otp-auth.repository');
const policy = require('./passenger-otp-auth.policy');
const errors = require('./passenger-otp-auth.errors');
const mapper = require('./passenger-otp-auth.mapper');

const RESTRICTED_STATUSES = ['banned', 'inactive', 'invited'];

/** Enforce current account restrictions from session state. */
const enforceSessionRestrictions = (user) => {
  if (user.deletedAt) throw errors.accountRestrictedError();
  if (RESTRICTED_STATUSES.includes(user.status)) throw errors.accountRestrictedError();
  if (user.forcePasswordChange) throw errors.forcePasswordChangeError();
};

/**
 * Load session state and repair legacy passenger role if roles[] is empty
 * but effective roles include 'passenger' via the historical `role` field.
 * Reloads state after any repair to ensure the token carries current roles[].
 */
const loadRepaired = async (userId) => {
  let state = await repository.loadPassengerSessionState(userId);
  if (!state) throw errors.unexpectedPassengerStateError('session state missing after resolution');

  const effectiveRoles = getEffectiveRoles(state.user);
  if (!effectiveRoles.includes('passenger')) {
    throw errors.unexpectedPassengerStateError('passenger role missing from resolved account');
  }

  // Repair: legacy account has role:'passenger' but roles:[] — add via $addToSet
  if (!Array.isArray(state.user.roles) || !state.user.roles.includes('passenger')) {
    await repository.materializeLegacyPassengerRole(userId);
    state = await repository.loadPassengerSessionState(userId);
    if (!state) throw errors.unexpectedPassengerStateError('session state missing after role repair');
    if (!Array.isArray(state.user.roles) || !state.user.roles.includes('passenger')) {
      throw errors.unexpectedPassengerStateError('legacy role repair failed to materialize passenger role');
    }
  }

  return state;
};

/**
 * Verify a passenger OTP and create a session.
 *
 * @param {{ rawPhone, otp, deviceInfo, ipAddress, now }} input
 * @returns {Promise<{ statusCode: 200, refreshToken: string|null, responseBody: Object }>}
 * @throws {AppError}
 */
const verifyPassengerOTPAndCreateSession = async ({
  rawPhone, otp, deviceInfo, ipAddress, now,
}) => {
  if (!rawPhone || !otp) throw errors.missingVerifyInputError();

  const normalizedPhone = normalizePhone(rawPhone);
  if (!normalizedPhone || !policy.isValidNepalMobile(normalizedPhone)) {
    throw errors.invalidPhoneError();
  }

  const cleanOtp = policy.cleanOtp(otp);
  if (!policy.isSixDigitOtp(cleanOtp)) throw errors.invalidOtpLengthError();

  const result = await otpHelper.verifyOTPCode(
    normalizedPhone, cleanOtp, policy.PASSENGER_AUTH_PURPOSE,
  );
  if (!result.valid) throw errors.invalidOtpError(result.error);

  const resolved = await passengerAccount.resolvePassengerAccountAfterPhoneVerification({
    phone: normalizedPhone,
    now,
  });

  const state = await loadRepaired(resolved._id);

  enforceSessionRestrictions(state.user);

  await repository.recordPassengerLogin(resolved._id, now);

  const { accessToken, refreshToken } = await tokenService.generateTokenPair(state.user, {
    deviceInfo,
    ipAddress,
    activeRole: 'passenger',
  });

  return {
    statusCode: 200,
    refreshToken,
    responseBody: {
      success: true,
      message: 'Phone verified successfully.',
      user: mapper.toPassengerUserResponse(state.user),
      accessToken,
      activeRole: 'passenger',
      passwordSetupRequired: !state.hasUsablePassword,
    },
  };
};

module.exports = { verifyPassengerOTPAndCreateSession };

'use strict';

const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const enumGuard = require('../../../../../utils/enumGuard');
const passwordValidator = require('../../../../../utils/passwordValidator');
const tokenService = require('../../../../../utils/tokenService');
const repository = require('./agent-password-reset.repository');
const policy = require('./agent-password-reset.policy');
const errors = require('./agent-password-reset.errors');

const sanitizeUser = (user) => {
  const value = user.toObject();
  delete value.password;
  return value;
};

const resetPassword = async ({ rawPhone, otp, newPassword, deviceInfo, ipAddress }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone || !otp || !newPassword) throw errors.missingResetInputError();
  const cleanOtp = policy.cleanOtp(otp);
  if (cleanOtp.length !== 6) throw errors.invalidOtpLengthError();
  const passValidation = passwordValidator.validatePassword(newPassword);
  if (!passValidation.valid) throw errors.invalidPasswordError(passValidation);
  const { valid, user, error } = await enumGuard.otpFirstVerify(
    phone,
    cleanOtp,
    policy.OTP_PURPOSE,
    true,
    otpHelper.verifyOTPCode,
    (value) => repository.findUserByPhone(value),
  );
  if (!valid || !policy.canRecoverPassword(user)) {
    throw errors.invalidOtpError(error || 'Invalid or expired verification code.');
  }
  const wasInvited = user.status === 'invited';
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  const freshUser = await repository.completePasswordReset({
    userId: user._id,
    expectedStatus: user.status,
    hashedPassword,
  });
  if (!freshUser) throw errors.invalidResetTargetError();
  await tokenService.revokeAllUserTokens(user._id);
  const pair = await tokenService.generateTokenPair(freshUser, {
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
    activeRole: 'agent',
  });
  return {
    statusCode: 200,
    refreshToken: pair.refreshToken,
    responseBody: {
      success: true,
      message: wasInvited
        ? 'Account activated and password created. You are now signed in.'
        : 'Password updated. You are now signed in.',
      user: sanitizeUser(freshUser),
      accessToken: pair.accessToken,
      activeRole: 'agent',
    },
  };
};

module.exports = {
  resetPassword,
};

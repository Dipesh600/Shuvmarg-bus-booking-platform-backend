'use strict';

const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const passwordValidator = require('../../../../../utils/passwordValidator');
const tokenService = require('../../../../../utils/tokenService');
const repository = require('./bus-owner-password-reset.repository');
const policy = require('./bus-owner-password-reset.policy');
const errors = require('./bus-owner-password-reset.errors');

const mutateUser = (user, hashedPassword) => {
  user.password = hashedPassword;
  if (!user.isVerified) user.isVerified = true;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.forcePasswordChange = false;
};

const resetPassword = async ({ rawPhone, otp, newPassword }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone || !otp || !newPassword) throw errors.missingResetInputError();
  const cleanOtp = policy.cleanOtp(otp);
  if (cleanOtp.length !== 6) throw errors.invalidOtpLengthError();
  const user = await repository.findUserByPhone(phone);
  if (!user) throw errors.invalidResetTargetError();
  const { hasRole } = await phoneGuard.checkPhoneForRole(phone, 'busOwner');
  if (!hasRole) throw errors.invalidResetTargetError();
  const otpResult = await otpHelper.verifyOTPCode(user.phone, cleanOtp, policy.OTP_PURPOSE, true);
  if (!otpResult.valid) throw errors.invalidOtpError(otpResult.error);
  const passValidation = passwordValidator.validatePassword(newPassword);
  if (!passValidation.valid) throw errors.invalidPasswordError(passValidation);
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  mutateUser(user, hashedPassword);
  await repository.saveUser(user);
  await tokenService.revokeAllUserTokens(user._id);
  await repository.incrementTokenVersion(user._id);
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'Password reset successful! You can now login.',
    },
  };
};

module.exports = {
  resetPassword,
  mutateUser,
};

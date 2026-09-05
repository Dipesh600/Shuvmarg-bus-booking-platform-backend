'use strict';

const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const enumGuard = require('../../../../../utils/enumGuard');
const passwordValidator = require('../../../../../utils/passwordValidator');
const tokenService = require('../../../../../utils/tokenService');
const repository = require('./driver-password-reset.repository');
const policy = require('./driver-password-reset.policy');
const errors = require('./driver-password-reset.errors');

const sentResult = (message = 'A verification code was sent to the Driver phone number.') => ({
  statusCode: 200,
  responseBody: { success: true, message },
});

const assertEligible = (target) => {
  switch (policy.recoveryState(target)) {
    case policy.RECOVERY_STATES.ELIGIBLE:
      return target;
    case policy.RECOVERY_STATES.INVITED:
      throw errors.driverAccountInvited();
    case policy.RECOVERY_STATES.UNAVAILABLE:
      throw errors.driverAccountUnavailable();
    default:
      throw errors.driverAccountNotFound();
  }
};

const mapSendError = (error) => {
  if (policy.isOtpBlocked(error)) throw errors.otpBlocked(policy.retryMinutes(error));
  if (error.message?.startsWith('OTP_COOLDOWN:')) {
    throw errors.otpCooldown(parseInt(error.message.split(':')[1], 10) || 60);
  }
  if (policy.isSmsDeliveryError(error)) throw errors.smsDeliveryFailed();
  throw error;
};

const requestPasswordReset = async ({ rawPhone }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone) throw errors.missingPhone();
  try {
    await enumGuard.withMinimumLatency(async () => {
      const target = await repository.findRecoveryTargetByPhone(phone);
      assertEligible(target);
      await otpHelper.createAndSendOTP(target.user.phone, policy.OTP_PURPOSE);
    }, policy.MINIMUM_LATENCY_MS);
  } catch (error) {
    mapSendError(error);
  }
  return sentResult();
};

const verifyOtpForReset = async ({ rawPhone, otp }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone || !otp) throw errors.missingVerifyInput();
  const cleanOtp = policy.cleanOtp(otp);
  if (cleanOtp.length !== 6) throw errors.invalidOtpLength();
  const result = await enumGuard.otpFirstVerify(
    phone,
    cleanOtp,
    policy.OTP_PURPOSE,
    false,
    otpHelper.verifyOTPCode,
    repository.findRecoveryTargetByPhone,
  );
  if (!result.valid) throw errors.invalidOtp();
  assertEligible(result.user);
  return {
    statusCode: 200,
    responseBody: { success: true, message: 'Code verified. Choose a new password.' },
  };
};

const resetPassword = async ({ rawPhone, otp, newPassword, deviceInfo, ipAddress }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone || !otp || !newPassword) throw errors.missingResetInput();
  const cleanOtp = policy.cleanOtp(otp);
  if (cleanOtp.length !== 6) throw errors.invalidOtpLength();
  const validation = passwordValidator.validatePassword(newPassword);
  if (!validation.valid) throw errors.invalidPassword(validation);
  const result = await enumGuard.otpFirstVerify(
    phone,
    cleanOtp,
    policy.OTP_PURPOSE,
    true,
    otpHelper.verifyOTPCode,
    repository.findRecoveryTargetByPhone,
  );
  if (!result.valid) throw errors.invalidOtp();
  const target = assertEligible(result.user);
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  const freshUser = await repository.completePasswordReset({
    userId: target.user._id,
    hashedPassword,
  });
  if (!freshUser) throw errors.invalidResetTarget();
  await tokenService.revokeAllUserTokens(freshUser._id);
  const pair = await tokenService.generateTokenPair(freshUser, {
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
    activeRole: 'driver',
  });
  const user = freshUser.toObject();
  delete user.password;
  return {
    statusCode: 200,
    refreshToken: pair.refreshToken,
    responseBody: {
      success: true,
      message: 'Password updated. You are now signed in.',
      user,
      accessToken: pair.accessToken,
      activeRole: 'driver',
    },
  };
};

const resendOtpForReset = async ({ rawPhone }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone) throw errors.missingPhone();
  try {
    const target = await repository.findRecoveryTargetByPhone(phone);
    assertEligible(target);
    await otpHelper.createAndSendOTP(target.user.phone, policy.OTP_PURPOSE);
  } catch (error) {
    mapSendError(error);
  }
  return sentResult('A new verification code was sent to the Driver phone number.');
};

module.exports = { requestPasswordReset, verifyOtpForReset, resetPassword, resendOtpForReset };

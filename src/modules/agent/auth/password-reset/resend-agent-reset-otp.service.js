'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const repository = require('./agent-password-reset.repository');
const policy = require('./agent-password-reset.policy');
const errors = require('./agent-password-reset.errors');

const neutralResult = () => ({
  statusCode: 200,
  responseBody: {
    success: true,
    message: 'If an account exists, a new code has been sent.',
  },
});

const resendOtpForReset = async ({ rawPhone }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone) throw errors.missingPhoneError();
  const user = await repository.findUserByPhone(phone);
  if (!user) return neutralResult();
  const { hasRole } = await phoneGuard.checkPhoneForRole(phone, 'agent');
  if (!hasRole) return neutralResult();
  if (policy.isSuspended(user)) throw errors.suspendedAccountError();
  let result;
  try {
    result = await otpHelper.createAndSendOTP(phone, policy.OTP_PURPOSE);
  } catch (err) {
    if (policy.isOtpBlocked(err)) throw errors.otpBlockedError(policy.retryMinutes(err));
    if (err.message && err.message.startsWith('OTP_COOLDOWN:')) {
      const secondsLeft = parseInt(err.message.split(':')[1], 10) || 60;
      throw errors.otpCooldownError(secondsLeft);
    }
    throw err;
  }
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'New verification code sent.',
      data: { expiresIn: result.expiresIn },
    },
  };
};

module.exports = {
  resendOtpForReset,
  neutralResult,
};

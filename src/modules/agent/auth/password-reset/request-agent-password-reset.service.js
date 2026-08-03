'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const enumGuard = require('../../../../../utils/enumGuard');
const repository = require('./agent-password-reset.repository');
const policy = require('./agent-password-reset.policy');
const errors = require('./agent-password-reset.errors');

const neutralResult = () => ({
  statusCode: 200,
  responseBody: {
    success: true,
    message: 'If an account exists, OTP has been sent.',
  },
});

const requestPasswordReset = async ({ rawPhone }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone) throw errors.missingPhoneError();
  await enumGuard.withMinimumLatency(async () => {
    const user = await repository.findUserByPhone(phone);
    if (!user) throw errors.accountNotFoundError();
    const { hasRole } = await phoneGuard.checkPhoneForRole(phone, 'agent');
    if (!hasRole) throw errors.accountNotFoundError();
    await otpHelper.createAndSendOTP(user.phone, policy.OTP_PURPOSE);
  }, policy.MINIMUM_LATENCY_MS);
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'OTP sent successfully. Please check your phone.',
    },
  };
};

module.exports = {
  requestPasswordReset,
  neutralResult,
};

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
    if (!policy.canRecoverPassword(user)) return;
    await otpHelper.createAndSendOTP(user.phone, policy.OTP_PURPOSE);
  }, policy.MINIMUM_LATENCY_MS);
  return neutralResult();
};

module.exports = {
  requestPasswordReset,
  neutralResult,
};

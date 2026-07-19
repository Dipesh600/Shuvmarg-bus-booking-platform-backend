'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const repository = require('./bus-owner-password-reset.repository');
const policy = require('./bus-owner-password-reset.policy');
const errors = require('./bus-owner-password-reset.errors');

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
  const { hasRole } = await phoneGuard.checkPhoneForRole(phone, 'busOwner');
  if (!hasRole) return neutralResult();
  if (policy.isSuspended(user)) throw errors.suspendedAccountError();
  const result = await otpHelper.createAndSendOTP(phone, policy.OTP_PURPOSE);
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

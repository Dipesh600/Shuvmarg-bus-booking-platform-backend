'use strict';

const phoneGuard = require('../../../../../utils/phoneGuard');
const otpHelper = require('../../../../../utils/otpHelper');
const enumGuard = require('../../../../../utils/enumGuard');
const repository = require('./agent-password-reset.repository');
const policy = require('./agent-password-reset.policy');
const errors = require('./agent-password-reset.errors');

const verifyOtpForReset = async ({ rawPhone, otp }) => {
  const phone = phoneGuard.normalizePhone(rawPhone);
  if (!phone || !otp) throw errors.missingVerifyInputError();
  const cleanOtp = policy.cleanOtp(otp);
  if (cleanOtp.length !== 6) throw errors.invalidOtpLengthError();
  const { valid, user, error } = await enumGuard.otpFirstVerify(
    phone,
    cleanOtp,
    policy.OTP_PURPOSE,
    false,
    otpHelper.verifyOTPCode,
    (p) => repository.findUserByPhone(p),
  );
  if (!valid) throw errors.invalidOtpError(error);
  if (!policy.canRecoverPassword(user)) throw errors.invalidAgentOtpError();
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: 'OTP verified. Proceed to reset password.',
    },
  };
};

module.exports = { verifyOtpForReset };

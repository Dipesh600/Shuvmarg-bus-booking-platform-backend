'use strict';

const enumGuard = require('../../../../utils/enumGuard');
const phoneGuard = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const repository = require('./password-reset.repository');
const policy = require('./password-reset.policy');
const errors = require('./password-reset.errors');

/**
 * Preserves the exact legacy verifyOtpForReset behavior.
 *
 * - OTP-first ordering (otpFirstVerify): OTP validated before user lookup.
 * - OTP is NOT consumed here (markUsed = false).
 * - Legacy email-flow defect preserved: lookupPhone may not match OTP record.
 *
 * KNOWN DEFECT (do not fix in this PR):
 *   When the flow is initiated with an email address, createAndSendOTP uses
 *   user.phone as the OTP lookup key. verifyOtpForReset normalizes the email
 *   and passes it to verifyOTPCode, which will fail to find the OTP record
 *   stored under the user's phone. The defect is characterized in tests.
 *
 * @param {{ emailOrPhone: string, otp: string|number }} input
 * @returns {{ statusCode: number, responseBody: object }}
 */
const verifyResetOtp = async ({ emailOrPhone, otp }) => {
  try {
    policy.validateVerifyInput(emailOrPhone, otp);
    const cleanOtp = policy.sanitizeOtp(otp);

    const lookupPhone = phoneGuard.normalizePhone(emailOrPhone) || emailOrPhone;

    const { valid } = await enumGuard.otpFirstVerify(
      lookupPhone,
      cleanOtp,
      'PASSWORD_RESET',
      false, // do NOT consume — resetPassword will do that
      otpHelper.verifyOTPCode,
      (p) => repository.findActiveAfterOtpVerification(p, emailOrPhone)
    );

    if (!valid) {
      return {
        statusCode: 400,
        responseBody: { status: false, message: 'Invalid or expired verification code.' },
      };
    }

    return {
      statusCode: 200,
      responseBody: { status: true, message: 'OTP verified. Proceed to reset password.' },
    };
  } catch (err) {
    if (err.statusCode) throw err;
    console.error(err);
    throw errors.verifyInternalError();
  }
};

module.exports = { verifyResetOtp };

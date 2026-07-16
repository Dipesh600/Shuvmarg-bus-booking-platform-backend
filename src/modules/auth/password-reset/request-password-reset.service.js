'use strict';

const enumGuard = require('../../../../utils/enumGuard');
const phoneGuard = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const repository = require('./password-reset.repository');
const policy = require('./password-reset.policy');
const errors = require('./password-reset.errors');

/**
 * Preserves the exact legacy requestPasswordReset behavior.
 *
 * - Enumeration-resistant: always 200 with the same body.
 * - OTP dispatched only when the account exists.
 * - Minimum-latency pad: 600 ms.
 *
 * @param {{ emailOrPhone: string }} input
 * @returns {{ statusCode: number, responseBody: object }}
 */
const requestPasswordReset = async ({ emailOrPhone }) => {
  try {
    policy.validateResetRequestInput(emailOrPhone);

    const normalizedPhone = phoneGuard.normalizePhone(emailOrPhone);
    const user = await repository.findForResetRequest(emailOrPhone, normalizedPhone);

    await enumGuard.withMinimumLatency(async () => {
      if (!user) return;
      await otpHelper.createAndSendOTP(user.phone, 'PASSWORD_RESET');
    }, 600);

    return {
      statusCode: 200,
      responseBody: { status: true, message: 'If an account exists, OTP has been sent.' },
    };
  } catch (err) {
    if (err.statusCode) throw err; // policy error — re-throw as-is
    throw errors.mapRequestError(err);
  }
};

module.exports = { requestPasswordReset };

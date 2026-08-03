'use strict';

const enumGuard = require('../../../../utils/enumGuard');
const phoneGuard = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const repository = require('./password-reset.repository');
const policy = require('./password-reset.policy');
const errors = require('./password-reset.errors');
const AppError = require('../../../shared/errors/app-error');

/**
 * Request a password-reset OTP for a passenger account.
 *
 * - Returns 404 ACCOUNT_NOT_FOUND when the phone is not registered.
 * - Returns 200 only after the OTP helper succeeds.
 * - Minimum-latency pad: 600 ms (applies to both found and not-found paths).
 * - Rate limiting is applied by the route middleware (otpSendLimiter, otpPresenceLimiter).
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
      if (!user) {
        throw new AppError('Account Not Found', 404, {
          status: false,
          message: 'No account found with this phone number. Please check the number or sign up.',
        });
      }
      await otpHelper.createAndSendOTP(user.phone, 'PASSWORD_RESET');
    }, 600);

    return {
      statusCode: 200,
      responseBody: { status: true, message: 'OTP sent successfully. Please check your phone.' },
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw errors.mapRequestError(err);
  }
};

module.exports = { requestPasswordReset };

'use strict';

const AppError = require('../../../shared/errors/app-error');
const otpHelper = require('../../../../utils/otpHelper');
const phoneGuard = require('../../../../utils/phoneGuard');
const verificationToken = require('../../../../utils/verificationToken');
const mapper = require('./registration.mapper');
const { toLegacyVerifyOtpError } = require('./registration.errors');

/**
 * Verify-phone-OTP service.
 *
 * Preserves the exact legacy response contracts from authController.verifyPhoneOTP.
 *
 * @param {{ phone: string, otp: string|number }} input
 * @returns {Promise<{ statusCode: number, responseBody: object }>}
 */
const verifyPhoneOTP = async ({ phone, otp }) => {
  try {
    if (!phone || !otp) {
      throw new AppError('Phone and OTP required', 400, {
        status: false,
        message: 'Phone number and OTP are required!',
      });
    }

    // Sanitize OTP input — digits only, exactly 6 characters
    const cleanOtp = String(otp).replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      throw new AppError('OTP must be 6 digits', 400, {
        status: false,
        message: 'OTP must be a 6-digit code.',
      });
    }

    const result = await otpHelper.verifyOTPCode(phone, cleanOtp, 'REGISTRATION');
    if (!result.valid) {
      throw new AppError('Invalid OTP', 400, {
        status: false,
        message: result.error,
      });
    }

    // Double-check: race condition guard — phone may have been registered
    const { registered } = await phoneGuard.isPhoneRegistered(phone);
    if (registered) {
      throw new AppError('Phone already registered', 400, {
        status: false,
        message: 'Phone verification could not be completed. Please start again.',
      });
    }

    const token = verificationToken.issueVerificationToken(phone, 'REGISTRATION');
    return mapper.toVerifyOtpSuccess(token);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Verify OTP Error:', error);
    throw toLegacyVerifyOtpError(error);
  }
};

module.exports = { verifyPhoneOTP };

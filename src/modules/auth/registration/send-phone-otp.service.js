'use strict';

const AppError = require('../../../shared/errors/app-error');
const otpHelper = require('../../../../utils/otpHelper');
const phoneGuard = require('../../../../utils/phoneGuard');
const mapper = require('./registration.mapper');
const { toLegacySendOtpError } = require('./registration.errors');

/**
 * Send-phone-OTP service.
 *
 * Preserves the exact legacy response contracts from authController.sendPhoneOTP.
 *
 * @param {{ phone: string }} input
 * @returns {Promise<{ statusCode: number, responseBody: object }>}
 */
const sendPhoneOTP = async ({ phone }) => {
  try {
    if (!phone) {
      throw new AppError('Phone number is required', 400, {
        success: false,
        message: 'Phone number is required!',
      });
    }

    const { registered } = await phoneGuard.isPhoneRegistered(phone);
    if (registered) {
      // Enumeration defence: same 200 shape, no OTP sent, no data field
      return mapper.toSendOtpRegisteredResponse();
    }

    const result = await otpHelper.createAndSendOTP(phone, 'REGISTRATION');
    return mapper.toSendOtpResponse(result);
  } catch (error) {
    // OTP_SEND_BLOCKED thrown by createAndSendOTP — map to 429
    if (error.message && error.message.startsWith('OTP_SEND_BLOCKED:')) {
      const minutesLeft = parseInt(error.message.split(':')[1], 10) || 10;
      throw new AppError(
        'OTP send blocked',
        429,
        {
          success: false,
          message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
          errorCode: 'OTP_SEND_BLOCKED',
          retryAfterMinutes: minutesLeft,
        }
      );
    }
    console.error('Send OTP Error:', error.message);
    throw toLegacySendOtpError(error);
  }
};

module.exports = { sendPhoneOTP };

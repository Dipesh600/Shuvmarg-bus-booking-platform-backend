'use strict';

/**
 * src/modules/auth/passenger-otp-auth/passenger-otp-auth.controller.js
 *
 * HTTP layer for passenger OTP authentication.
 *
 * Mounted at /api/auth/passenger (via passengerAuthRoutes.js):
 *   POST /sendOTP   — request an authentication OTP
 *   POST /verifyOTP — verify OTP and receive a session
 */

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const requestService = require('./request-passenger-otp.service');
const verifyService = require('./verify-passenger-otp.service');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const handleError = (res, error, logPrefix) => {
  if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
  console.error(logPrefix, error.message);
  return respond(res, 500, { success: false, message: 'An unexpected error occurred. Please try again.' });
};

/**
 * POST /api/auth/passenger/sendOTP
 * Public — no JWT required.
 */
const sendOTP = asyncHandler(async (req, res) => {
  try {
    const result = await requestService.requestPassengerOTP({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Passenger sendOTP] Error:');
  }
});

/**
 * POST /api/auth/passenger/verifyOTP
 * Public — no JWT required.
 * Sets an httpOnly refreshToken cookie on success.
 */
const verifyOTP = asyncHandler(async (req, res) => {
  try {
    const result = await verifyService.verifyPassengerOTPAndCreateSession({
      rawPhone: req.body.phone,
      otp: req.body.otp,
      deviceInfo: req.get('User-Agent') || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      now: new Date(),
    });
    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, cookieOptions());
    }
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Passenger verifyOTP] Error:');
  }
});

module.exports = { sendOTP, verifyOTP };

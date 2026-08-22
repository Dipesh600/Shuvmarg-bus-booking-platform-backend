'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-registration.service');
const errors = require('./agent-registration.errors');
const { setPortalRefreshCookie } = require('../../../../../utils/portalSessionCookies');

const handleError = (res, error, prefix, statusCode, body) => {
  if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
  console.error(prefix, error.message);
  return respond(res, statusCode, body);
};

const sendOTP = asyncHandler(async (req, res) => {
  try {
    const result = await service.sendOTP({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent sendOTP] Error:', 500, {
      success: false,
      message: 'Failed to send verification code. Please try again.',
    });
  }
});

const verifyOTP = asyncHandler(async (req, res) => {
  try {
    const result = await service.verifyOTP({
      rawPhone: req.body.phone,
      otp: req.body.otp,
    });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent verifyOTP] Error:', 500, {
      success: false,
      message: 'Failed to verify code. Please try again.',
    });
  }
});

const register = asyncHandler(async (req, res) => {
  try {
    const { name, password, email, verificationToken } = req.body;
    const result = await service.register({
      rawPhone: req.body.phone,
      name,
      password,
      email,
      verificationToken,
      deviceInfo: req.get('User-Agent') || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
    });
    setPortalRefreshCookie(res, 'agent', result.refreshToken);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[Agent register] Error:', error.message, error.stack?.split('\n')?.[1]);
    if (error.code === 11000) {
      const mapped = errors.duplicateKeyError(error);
      return respond(res, mapped.statusCode, mapped.responseBody);
    }
    return respond(res, 500, {
      success: false,
      message: 'Registration failed. Please try again.',
    });
  }
});

const resendOTP = asyncHandler(async (req, res) => {
  try {
    const result = await service.resendOTP({ rawPhone: req.body.phone });
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    return handleError(res, error, '[Agent resendOTP] Error:', 500, {
      success: false,
      message: 'Failed to resend code. Please try again.',
    });
  }
});

module.exports = {
  sendOTP,
  verifyOTP,
  register,
  resendOTP,
};

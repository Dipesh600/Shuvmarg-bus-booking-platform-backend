'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./bus-owner-registration.service');
const errors = require('./bus-owner-registration.errors');
const policy = require('./bus-owner-registration.policy');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

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
    return handleError(res, error, '[BusOwner sendOTP] Error:', 500, {
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
    return handleError(res, error, '[BusOwner verifyOTP] Error:', 500, {
      success: false,
      message: 'Failed to verify code. Please try again.',
    });
  }
});

const register = asyncHandler(async (req, res) => {
  try {
    const { name, password, email, companyName, address, verificationToken } = req.body;
    const result = await service.register({
      rawPhone: req.body.phone,
      name,
      password,
      email,
      companyName,
      address,
      verificationToken,
      deviceInfo: req.get('User-Agent') || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
    });
    if (result.refreshToken) res.cookie('refreshToken', result.refreshToken, cookieOptions());
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[BusOwner register] Error:', error.message);
    if (error.code === 11000) {
      const mapped = errors.duplicateKeyError(policy.duplicateKeyMessage(error));
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
    return handleError(res, error, '[BusOwner resendOTP] Error:', 500, {
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

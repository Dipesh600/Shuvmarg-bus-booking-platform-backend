'use strict';

const AppError = require('../../../../shared/errors/app-error');
const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-login.service');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const genericLoginFailure = () => ({
  success: false,
  message: 'Login failed. Please try again.',
});

const login = asyncHandler(async (req, res) => {
  try {
    const { password } = req.body;
    const rawPhone = req.body.phone || req.body.emailOrPhone;
    const result = await service.login({
      rawPhone,
      password,
      deviceInfo: req.get('User-Agent') || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
    });

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, cookieOptions());
    }

    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) {
      return respond(res, error.statusCode, error.responseBody);
    }
    console.error('[Agent login] Error:', error.message);
    return respond(res, 500, genericLoginFailure());
  }
});

module.exports = {
  login,
};

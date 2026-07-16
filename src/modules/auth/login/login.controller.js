'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const loginService = require('./login.service');

exports.login = asyncHandler(async (req, res) => {
  const { emailOrPhone, password } = req.body;

  if (!emailOrPhone || !password) {
    return respond(res, 400, {
      success: false,
      message: `${!emailOrPhone ? 'Email or Phone' : 'Password'} is required!`,
    });
  }

  const appSource = (req.get('X-App-Source') || '').toLowerCase();
  const deviceInfo = req.get('User-Agent') || null;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;

  const result = await loginService.authenticate({
    emailOrPhone,
    password,
    appSource,
    deviceInfo,
    ipAddress,
  });

  if (result.refreshToken) {
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  return respond(res, result.statusCode, result.responseBody);
});

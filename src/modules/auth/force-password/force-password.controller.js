'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./force-password.service');

exports.changeForcePassword = asyncHandler(async (req, res) => {
  const { tempToken, newPassword, phone, otp } = req.body;

  const result = await service.changeForcePassword({
    tempToken,
    newPassword,
    phone,
    otp,
    deviceInfo: req.get('User-Agent') || null,
    ipAddress: req.ip || req.connection?.remoteAddress || null,
  });

  if (result.refreshToken) {
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  return respond(res, result.statusCode, result.responseBody);
});

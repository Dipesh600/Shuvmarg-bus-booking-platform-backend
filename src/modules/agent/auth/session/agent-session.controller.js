'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-session.service');
const errors = require('./agent-session.errors');

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Lax',
});

const refreshCookieOptions = () => ({
  ...cookieOptions(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const refresh = asyncHandler(async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) throw errors.missingRefreshTokenError();

    const result = await service.rotateSession({
      refreshToken,
      deviceInfo: req.headers['user-agent'] || null,
      ipAddress: req.ip || null,
    });

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, refreshCookieOptions());
    }

    return respond(res, 200, {
      success: true,
      message: 'Token refreshed successfully.',
      accessToken: result.accessToken,
    });
  } catch (error) {
    const mapped = errors.mapRefreshError(error);
    console.error('[Agent refresh] Error:', error.message);
    return respond(res, mapped.statusCode, mapped.responseBody);
  }
});

const logout = asyncHandler(async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) await service.revokeSessionToken(refreshToken);

    res.clearCookie('refreshToken', cookieOptions());

    const userId = req.userInfo?.id;
    if (userId) await service.invalidateAccessToken(userId);

    return respond(res, 200, {
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('[Agent logout] Error:', error.message);
    try {
      res.clearCookie('refreshToken', cookieOptions());
    } catch (clearError) {
      console.error('[Agent logout] Error:', clearError.message);
    }
    return respond(res, 200, { success: true, message: 'Logged out.' });
  }
});

module.exports = {
  refresh,
  logout,
};

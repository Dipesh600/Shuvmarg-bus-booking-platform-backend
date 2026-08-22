'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-session.service');
const errors = require('./agent-session.errors');
const { readPortalRefreshToken, setPortalRefreshCookie, clearPortalRefreshCookies } = require('../../../../../utils/portalSessionCookies');

const refresh = asyncHandler(async (req, res) => {
  try {
    const refreshToken = readPortalRefreshToken(req, 'agent');
    if (!refreshToken) throw errors.missingRefreshTokenError();

    const result = await service.rotateSession({
      refreshToken,
      deviceInfo: req.headers['user-agent'] || null,
      ipAddress: req.ip || null,
    });

    if (result.refreshToken) {
      setPortalRefreshCookie(res, 'agent', result.refreshToken);
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
    const refreshToken = readPortalRefreshToken(req, 'agent');

    if (refreshToken) await service.revokeSessionToken(refreshToken);

    clearPortalRefreshCookies(res, 'agent');

    const userId = req.userInfo?.id;
    if (userId) await service.invalidateAccessToken(userId);

    return respond(res, 200, {
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('[Agent logout] Error:', error.message);
    try {
      clearPortalRefreshCookies(res, 'agent');
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

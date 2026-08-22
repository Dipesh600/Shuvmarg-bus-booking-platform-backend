const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const sessionService = require('./session.service');
const { readPortalRefreshToken, setPortalRefreshCookie, clearPortalRefreshCookies } = require('../../../../utils/portalSessionCookies');

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = readPortalRefreshToken(req, 'passenger');

  const result = await sessionService.refreshSession({
    refreshToken,
    deviceInfo: req.get('User-Agent'),
    ipAddress: req.ip || req.connection?.remoteAddress,
  });

  if (result.refreshToken) {
    setPortalRefreshCookie(res, 'passenger', result.refreshToken);
  }

  return respond(res, result.statusCode, result.responseBody);
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = readPortalRefreshToken(req, 'passenger');
  const userId = req.userInfo?.id;

  clearPortalRefreshCookies(res, 'passenger');

  const result = await sessionService.logoutSession({
    refreshToken,
    userId,
  });

  return respond(res, result.statusCode, result.responseBody);
});

module.exports = {
  refreshAccessToken,
  logout,
};

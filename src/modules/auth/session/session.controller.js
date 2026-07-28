const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const sessionService = require('./session.service');

const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  const result = await sessionService.refreshSession({
    refreshToken,
    deviceInfo: req.get('User-Agent'),
    ipAddress: req.ip || req.connection?.remoteAddress,
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

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  const userId = req.userInfo?.id;

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
  });

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

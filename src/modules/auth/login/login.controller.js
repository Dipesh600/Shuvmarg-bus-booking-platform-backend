'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const loginService = require('./login.service');
const { setPortalRefreshCookie } = require('../../../../utils/portalSessionCookies');

exports.login = asyncHandler(async (req, res) => {
  // Controller: read request metadata only — no validation, no policy logic
  const { emailOrPhone, password } = req.body;
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
    setPortalRefreshCookie(res, 'passenger', result.refreshToken);
  }

  return respond(res, result.statusCode, result.responseBody);
});

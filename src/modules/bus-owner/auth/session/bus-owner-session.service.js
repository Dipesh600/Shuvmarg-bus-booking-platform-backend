'use strict';

const tokenService = require('../../../../../utils/tokenService');
const repository = require('./bus-owner-session.repository');

const rotateSession = ({ refreshToken, deviceInfo, ipAddress }) => {
  return tokenService.rotateRefreshToken(refreshToken, {
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
  });
};

const revokeSessionToken = (refreshToken) => {
  if (!refreshToken) return null;
  return tokenService.revokeRefreshToken(refreshToken);
};

const invalidateAccessToken = (userId) => {
  if (!userId) return null;
  return repository.incrementTokenVersion(userId);
};

module.exports = {
  rotateSession,
  revokeSessionToken,
  invalidateAccessToken,
};

'use strict';

const AppError = require('../../../../shared/errors/app-error');

const body = (message) => ({ success: false, message });

const missingRefreshTokenError = () => new AppError(
  'Session expired. Please sign in again.',
  401,
  body('Session expired. Please sign in again.'),
);

const expiredOrInvalidRefreshTokenError = (cause) => new AppError(
  'Session expired. Please sign in again.',
  401,
  body('Session expired. Please sign in again.'),
  null,
  cause,
);

const bannedAccountError = (cause) => new AppError(
  'Your account has been suspended.',
  403,
  body('Your account has been suspended.'),
  null,
  cause,
);

const revokedRoleError = (cause) => new AppError(
  'Access revoked. Please contact support.',
  403,
  body('Access revoked. Please contact support.'),
  null,
  cause,
);

const unknownRefreshFailureError = (cause) => new AppError(
  'Session could not be renewed. Please sign in again.',
  401,
  body('Session could not be renewed. Please sign in again.'),
  null,
  cause,
);

const mapRefreshError = (error) => {
  if (error instanceof AppError) return error;
  if (
    error.message === 'INVALID_REFRESH_TOKEN' ||
    error.message === 'REFRESH_TOKEN_EXPIRED'
  ) {
    return expiredOrInvalidRefreshTokenError(error);
  }
  if (error.message === 'ACCOUNT_BANNED') return bannedAccountError(error);
  if (error.message === 'ROLE_REVOKED') return revokedRoleError(error);
  return unknownRefreshFailureError(error);
};

module.exports = {
  missingRefreshTokenError,
  expiredOrInvalidRefreshTokenError,
  bannedAccountError,
  revokedRoleError,
  unknownRefreshFailureError,
  mapRefreshError,
};

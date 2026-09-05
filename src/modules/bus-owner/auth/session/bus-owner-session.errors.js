'use strict';

const AppError = require('../../../../shared/errors/app-error');

const body = (message, errorCode) => ({ success: false, message, ...(errorCode && { errorCode }) });

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
  body('Access revoked. Please contact support.', 'ROLE_REVOKED'),
  null,
  cause,
);

const wrongPortalSessionError = (cause) => new AppError(
  'This session belongs to another portal. Please sign in again.',
  401,
  body('This session belongs to another portal. Please sign in again.', 'SESSION_ROLE_MISMATCH'),
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
  if (['ACCOUNT_INACTIVE', 'ACCOUNT_NOT_ACTIVATED', 'FORCE_PASSWORD_CHANGE', 'ACCOUNT_DEACTIVATED'].includes(error.message)) {
    return require('../../../auth/session/session.errors').mapTokenError(error);
  }
  if (error.message === 'ACCOUNT_BANNED') return bannedAccountError(error);
  if (error.message === 'ROLE_REVOKED') return revokedRoleError(error);
  if (error.message === 'SESSION_ROLE_MISMATCH') return wrongPortalSessionError(error);
  return unknownRefreshFailureError(error);
};

module.exports = {
  missingRefreshTokenError,
  expiredOrInvalidRefreshTokenError,
  bannedAccountError,
  revokedRoleError,
  wrongPortalSessionError,
  unknownRefreshFailureError,
  mapRefreshError,
};

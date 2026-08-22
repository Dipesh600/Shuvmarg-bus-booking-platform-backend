const AppError = require('../../../shared/errors/app-error');

const REFRESH_ERRORS = {
  INVALID_REFRESH_TOKEN: { status: 401, message: 'Invalid or revoked refresh token. Please login again.' },
  REFRESH_TOKEN_EXPIRED: { status: 401, message: 'Refresh token expired. Please login again.' },
  USER_NOT_FOUND: { status: 401, message: 'User not found. Please login again.' },
  ACCOUNT_DEACTIVATED: { status: 403, message: 'This account has been deactivated. Contact support.' },
  ACCOUNT_BANNED: { status: 403, message: 'Your account has been banned. Contact support.' },
  ROLE_REVOKED: { status: 403, message: 'Your role has been revoked. Please login again.' },
  SESSION_ROLE_MISMATCH: { status: 401, message: 'This session belongs to another portal. Please sign in again.' },
};

const mapTokenError = (error) => {
  const mapped = REFRESH_ERRORS[error.message];
  if (mapped) {
    return new AppError(
      mapped.message,
      mapped.status,
      { success: false, message: mapped.message, errorCode: error.message },
      null,
      error
    );
  }
  return new AppError(
    'Internal Server Error',
    500,
    { success: false, message: 'Internal Server Error' },
    null,
    error
  );
};

module.exports = {
  mapTokenError,
  REFRESH_ERRORS,
};

'use strict';

const AppError = require('../../../shared/errors/app-error');

const unauthorizedError = () =>
  new AppError('Unauthorized', 401, {
    status: false,
    message: 'Unauthorized: User not authenticated',
  });

const missingPasswordsError = () =>
  new AppError('Missing passwords', 400, {
    status: false,
    message: 'Both old password and new password are required',
  });

const invalidNewPasswordError = (passwordCheck) =>
  new AppError('Invalid Password', 400, {
    status: false,
    message: passwordCheck.errors[0],
    errors: passwordCheck.errors,
  });

const userNotFoundError = () =>
  new AppError('User not found', 404, {
    status: false,
    message: 'User not found',
  });

const incorrectCurrentPasswordError = (remaining) =>
  new AppError('Incorrect current password', 401, {
    success: false,
    message: `Current password is incorrect. ${remaining} attempt(s) remaining.`,
  });

const accountLockedError = () =>
  new AppError('Account locked', 401, {
    success: false,
    message: 'Too many failed attempts. Account locked for 15 minutes and all sessions revoked.',
  });

const samePasswordError = () =>
  new AppError('Same password', 400, {
    status: false,
    message: 'New password must be different from current password',
  });

const updatePasswordFailedError = (cause) =>
  new AppError('Update password failed', 500, {
    status: false,
    message: 'Internal server error',
  }, null, cause);

module.exports = {
  unauthorizedError,
  missingPasswordsError,
  invalidNewPasswordError,
  userNotFoundError,
  incorrectCurrentPasswordError,
  accountLockedError,
  samePasswordError,
  updatePasswordFailedError,
};

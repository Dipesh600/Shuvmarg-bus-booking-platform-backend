'use strict';

const AppError = require('../../../../shared/errors/app-error');

const error = (message, statusCode, extra = {}) => new AppError(
  message,
  statusCode,
  { success: false, message, ...extra },
);

const missingPhoneError = () => error('Phone number is required.', 400);
const missingPasswordError = () => error('Password is required.', 400);
const invalidCredentialsError = () => error('Invalid phone number or password.', 401);

const deletedAccountError = () => error(
  'This account has been deactivated. Please contact support.',
  403,
  { errorCode: 'ACCOUNT_DEACTIVATED' },
);

const lockedAccountError = (minutes) => error(
  `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
  429,
  { errorCode: 'ACCOUNT_LOCKED' },
);

const bannedAccountError = (message) => error(
  message,
  403,
  { errorCode: 'ACCOUNT_BANNED' },
);

const inactiveAccountError = (message) => error(
  message,
  403,
  { errorCode: 'ACCOUNT_INACTIVE' },
);

const missingBusOwnerRoleError = () => error(
  "You don't have an operator account. Please register as a bus operator first.",
  403,
  { errorCode: 'ROLE_NOT_FOUND' },
);

const invalidPasswordAttemptsError = (remaining) => error(
  `Invalid phone number or password. ${remaining} attempt(s) remaining.`,
  401,
);

const newlyLockedAccountError = () => error(
  'Too many failed attempts. Account locked for 15 minutes.',
  401,
);

const temporaryCredentialExpiredError = () => error(
  'Your one-time password has expired. Ask an administrator to resend operator access.',
  410,
  { errorCode: 'TEMPORARY_CREDENTIAL_EXPIRED' },
);

module.exports = {
  missingPhoneError,
  missingPasswordError,
  invalidCredentialsError,
  deletedAccountError,
  lockedAccountError,
  bannedAccountError,
  inactiveAccountError,
  missingBusOwnerRoleError,
  invalidPasswordAttemptsError,
  newlyLockedAccountError,
  temporaryCredentialExpiredError,
};

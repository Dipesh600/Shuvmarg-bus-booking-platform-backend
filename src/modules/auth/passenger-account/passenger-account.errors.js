'use strict';

/**
 * src/modules/auth/passenger-account/passenger-account.errors.js
 *
 * Controlled domain errors for the passenger-account resolution module.
 *
 * All errors use AppError so the future controller can map them to HTTP
 * responses without seeing raw MongoDB messages, Mongoose internals,
 * passwords, role details or internal document IDs.
 */

const AppError = require('../../../shared/errors/app-error');

// ── Helper ────────────────────────────────────────────────────────────────────

const bodyError = (message, statusCode, extra = {}) =>
  new AppError(message, statusCode, { success: false, message, ...extra });

// ── Exported error factories ──────────────────────────────────────────────────

/**
 * The supplied phone was missing or could not be resolved to a normalized form.
 */
const missingPhoneError = () =>
  bodyError('A verified phone number is required.', 400);

/**
 * The existing account is restricted and may not receive passenger access.
 * The message is intentionally generic to avoid leaking account state.
 */
const restrictedAccountError = () =>
  bodyError(
    'This phone number is associated with a restricted account. Please contact support.',
    403,
    { errorCode: 'ACCOUNT_RESTRICTED' },
  );

/**
 * The identity document is in an unexpected state that the service
 * cannot safely resolve.  This is a programming or data-integrity error.
 */
const unexpectedIdentityStateError = (details) =>
  new AppError(
    `Unexpected identity state during passenger resolution: ${details}`,
    500,
    null,
    'UNEXPECTED_IDENTITY_STATE',
  );

/**
 * A duplicate-key race occurred but the winning user could not be re-read
 * or did not match the expected passenger state.
 */
const raceRecoveryFailedError = () =>
  new AppError(
    'Could not recover from concurrent registration. Please try again.',
    500,
    null,
    'RACE_RECOVERY_FAILED',
  );

module.exports = {
  missingPhoneError,
  restrictedAccountError,
  unexpectedIdentityStateError,
  raceRecoveryFailedError,
};

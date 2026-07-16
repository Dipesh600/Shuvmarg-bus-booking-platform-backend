'use strict';

/**
 * src/shared/errors/app-error.js
 *
 * Base class for all intentional, operational errors in the application.
 *
 * Usage
 * -----
 *   throw new AppError('Not found', 404);
 *   throw new AppError('Banned', 403, null, 'ACCOUNT_BANNED');
 *   throw new AppError('Legacy shape', 422, { status: false, errorCode: 'X' });
 *
 * Properties
 * ----------
 *   message        – human-readable description (inherited from Error)
 *   statusCode     – HTTP status code to send
 *   isOperational  – always true; used by error-handler to distinguish
 *                    operational errors from programming errors
 *   responseBody   – optional; when present the error-handler returns this
 *                    object exactly, allowing legacy response shapes to be
 *                    preserved during structural migration
 *   errorCode      – optional machine-readable code (e.g. 'ACCOUNT_BANNED')
 *   cause          – optional upstream error for internal chaining
 */
class AppError extends Error {
  /**
   * @param {string}      message       - Human-readable error description.
   * @param {number}      statusCode    - HTTP status code (default 500).
   * @param {object|null} responseBody  - Exact JSON body to return to client,
   *                                     or null to use the default shape.
   * @param {string|null} errorCode     - Machine-readable error identifier.
   * @param {Error|null}  cause         - Upstream error for internal chaining.
   */
  constructor(
    message,
    statusCode = 500,
    responseBody = null,
    errorCode = null,
    cause = null,
  ) {
    super(message);

    // Restore the correct prototype chain so `instanceof AppError` works
    // after TypeScript/Babel transpilation and in plain Node CJS modules.
    Object.setPrototypeOf(this, new.target.prototype);

    this.name        = 'AppError';
    this.statusCode  = statusCode;
    this.isOperational = true;
    this.responseBody  = responseBody || null;
    this.errorCode     = errorCode || null;
    this.cause         = cause || null;

    // Capture a clean stack trace that starts at the call site,
    // not at this constructor.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = AppError;

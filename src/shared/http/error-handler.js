'use strict';

/**
 * src/shared/http/error-handler.js
 *
 * Global Express error-handling middleware.
 *
 * Decision tree
 * ─────────────
 *   headers already sent → delegate to default Express finalhandler
 *   AppError + responseBody → return responseBody exactly at AppError.statusCode
 *   AppError (no responseBody) → { status:false, message, [errorCode] }
 *   unknown error → existing generic 500 contract (unchanged from index.js)
 *
 * The generic 500 body is:
 *   { status: false, message: "An unexpected server error occurred…", [error] }
 * where `error` is included only in development mode.
 *
 * Do not expose stack traces in HTTP responses.
 */

const logger     = require('../../../utils/logger.js');
const AppError   = require('../errors/app-error.js');

const GENERIC_500_MESSAGE =
  'An unexpected server error occurred. Please try again later.';

/**
 * @param {Error}                        err
 * @param {import('express').Request}    req
 * @param {import('express').Response}   res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // If response streaming has already started, hand off to Express default.
  if (res.headersSent) {
    return next(err);
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  // ── Logging ────────────────────────────────────────────────────────────────
  const isAppError = err instanceof AppError;
  const isOperational = isAppError && err.statusCode < 500;
  
  if (isOperational) {
    logger.warn('AppError (operational)', {
      requestId: req.requestId,
      error:     err.message,
      statusCode: err.statusCode,
      path:      req.originalUrl || req.path,
      method:    req.method,
    });
  } else {
    logger.error('Unhandled server error', {
      requestId: req.requestId,
      error:     err.message,
      stack:     isDevelopment ? err.stack : undefined,
      path:      req.originalUrl || req.path,
      method:    req.method,
    });
  }

  // ── AppError: caller-supplied responseBody ──────────────────────────────
  if (err instanceof AppError && err.responseBody) {
    return res.status(err.statusCode).json(err.responseBody);
  }

  // ── AppError: no responseBody — use simple default shape ───────────────
  if (err instanceof AppError) {
    const body = { status: false, message: err.message };
    if (err.errorCode) body.errorCode = err.errorCode;
    return res.status(err.statusCode).json(body);
  }

  // ── Unknown / programming error — preserve exact legacy 500 contract ───
  const body = {
    status:  false,
    message: GENERIC_500_MESSAGE,
    ...(isDevelopment && { error: err.message }),
  };
  return res.status(500).json(body);
};

module.exports = errorHandler;

'use strict';

/**
 * src/shared/http/async-handler.js
 *
 * Wraps an async Express route handler so that any rejected promise is
 * forwarded to Express's error pipeline via next(error).
 *
 * Usage
 * -----
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 *
 * @param  {Function} fn  Async Express handler (req, res, next) => Promise
 * @returns {Function}    Standard Express handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

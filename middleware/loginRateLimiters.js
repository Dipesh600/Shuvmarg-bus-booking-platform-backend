'use strict';

/**
 * middleware/loginRateLimiters.js
 *
 * Centralized login and password-change rate limiters used across all
 * auth route files. Keeping them here (rather than inline in each route file)
 * means:
 *
 *  1. There is exactly one MemoryStore per limiter — shared correctly across
 *     all route files that mount the same Express app.
 *  2. Test helpers can call resetAll() to clear accumulated state between
 *     independent test runs, without disabling or weakening the limiters.
 *
 * Production behavior is unchanged:
 *   - loginLimiter        — 10 login attempts per account per 15 minutes
 *   - passwordChangeLimiter — 5 password-change attempts per account per 15 min
 *
 * Test isolation:
 *   resetAll() clears all in-memory limiter state. It is only called from
 *   test helpers and is never reachable over HTTP.
 */

const rateLimit = require('express-rate-limit');
const { MemoryStore } = rateLimit;

// ── Login limiter (account-keyed, 10 per 15 min) ─────────────────────────────

const _loginStore = new MemoryStore();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: _loginStore,
  keyGenerator: (req) => {
    const identifier = req.body?.phone || req.body?.emailOrPhone || req.ip;
    return String(identifier).replace(/\s+/g, '').toLowerCase();
  },
  message: {
    success: false,
    message: 'Too many login attempts. Please wait 15 minutes.',
    errorCode: 'LOGIN_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ── Bus-owner login limiter (identical contract, separate store) ──────────────

const _busOwnerLoginStore = new MemoryStore();

const busOwnerLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: _busOwnerLoginStore,
  keyGenerator: (req) => {
    const identifier = req.body?.phone || req.body?.emailOrPhone || req.ip;
    return String(identifier).replace(/\s+/g, '').toLowerCase();
  },
  message: {
    success: false,
    message: 'Too many login attempts for this account. Please wait 15 minutes.',
    errorCode: 'LOGIN_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ── Agent login limiter (identical contract, separate store) ──────────────────

const _agentLoginStore = new MemoryStore();

const agentLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: _agentLoginStore,
  keyGenerator: (req) => {
    const identifier = req.body?.phone || req.body?.emailOrPhone || req.ip;
    return String(identifier).replace(/\s+/g, '').toLowerCase();
  },
  message: {
    success: false,
    message: 'Too many login attempts. Please wait 15 minutes.',
    errorCode: 'LOGIN_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// ── Password-change limiter (account+IP keyed, 5 per 15 min) ─────────────────

const _passwordChangeStore = new MemoryStore();

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  store: _passwordChangeStore,
  keyGenerator: (req) => `${req.ip}_${req.userInfo?.id || ''}`,
  message: {
    success: false,
    message: 'Too many password change attempts. Please wait 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Test-only: reset all in-memory limiter state ──────────────────────────────
// NOT reachable over HTTP. Call only from test helpers (e.g. db.clearAll).

const resetAll = () => {
  _loginStore.resetAll();
  _busOwnerLoginStore.resetAll();
  _agentLoginStore.resetAll();
  _passwordChangeStore.resetAll();
};

module.exports = {
  loginRateLimiter,
  busOwnerLoginRateLimiter,
  agentLoginRateLimiter,
  passwordChangeLimiter,
  resetAll,
};

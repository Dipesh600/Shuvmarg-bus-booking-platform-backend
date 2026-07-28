'use strict';

const rateLimit = require('express-rate-limit');
const { MemoryStore } = rateLimit;

const accountKey = (req) => {
  const identifier = req.body?.phone || req.body?.emailOrPhone || req.ip;
  return String(identifier).replace(/\s+/g, '').toLowerCase();
};

const loginOptions = (store, message, errorCode) => ({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store,
  keyGenerator: accountKey,
  message: { success: false, message, errorCode },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const createLoginRateLimiters = ({ stores = {} } = {}) => {
  const ownedStores = {
    passengerLoginStore: stores.passengerLoginStore || new MemoryStore(),
    busOwnerLoginStore: stores.busOwnerLoginStore || new MemoryStore(),
    agentLoginStore: stores.agentLoginStore || new MemoryStore(),
    passwordChangeStore: stores.passwordChangeStore || new MemoryStore(),
  };

  const loginRateLimiter = rateLimit(loginOptions(
    ownedStores.passengerLoginStore,
    'Too many login attempts. Please wait 15 minutes.',
    'LOGIN_RATE_LIMIT',
  ));
  const busOwnerLoginRateLimiter = rateLimit(loginOptions(
    ownedStores.busOwnerLoginStore,
    'Too many login attempts for this account. Please wait 15 minutes.',
    'LOGIN_RATE_LIMIT_EXCEEDED',
  ));
  const agentLoginRateLimiter = rateLimit(loginOptions(
    ownedStores.agentLoginStore,
    'Too many login attempts. Please wait 15 minutes.',
    'LOGIN_RATE_LIMIT',
  ));
  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    store: ownedStores.passwordChangeStore,
    keyGenerator: (req) => `${req.ip}_${req.userInfo?.id || ''}`,
    message: {
      success: false,
      message: 'Too many password change attempts. Please wait 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const reset = async () => {
    await Promise.all(Object.values(ownedStores).map((store) => store.resetAll()));
  };

  return {
    loginRateLimiter,
    busOwnerLoginRateLimiter,
    agentLoginRateLimiter,
    passwordChangeLimiter,
    stores: ownedStores,
    reset,
  };
};

const productionLoginRateLimiters = createLoginRateLimiters();

module.exports = {
  loginRateLimiter: productionLoginRateLimiters.loginRateLimiter,
  busOwnerLoginRateLimiter: productionLoginRateLimiters.busOwnerLoginRateLimiter,
  agentLoginRateLimiter: productionLoginRateLimiters.agentLoginRateLimiter,
  passwordChangeLimiter: productionLoginRateLimiters.passwordChangeLimiter,
  createLoginRateLimiters,
};

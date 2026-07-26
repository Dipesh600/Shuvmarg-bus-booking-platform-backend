'use strict';

const rateLimit = require('express-rate-limit');
const { MemoryStore } = rateLimit;

const createGlobalRateLimiters = ({ stores = {} } = {}) => {
  const ownedStores = {
    apiStore: stores.apiStore || new MemoryStore(),
    searchStore: stores.searchStore || new MemoryStore(),
  };

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    store: ownedStores.apiStore,
    message: {
      success: false,
      message: 'Too many requests from this IP. Try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    store: ownedStores.searchStore,
    message: {
      success: false,
      message: 'Search rate limit exceeded. Please slow down.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const reset = async () => {
    await Promise.all(Object.values(ownedStores).map((store) => store.resetAll()));
  };

  return {
    apiLimiter,
    searchLimiter,
    stores: ownedStores,
    reset,
  };
};

const productionGlobalRateLimiters = createGlobalRateLimiters();

module.exports = {
  apiLimiter: productionGlobalRateLimiters.apiLimiter,
  searchLimiter: productionGlobalRateLimiters.searchLimiter,
  createGlobalRateLimiters,
};

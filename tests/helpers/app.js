'use strict';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

// Prevent external providers from erroring out during import or invocation in test mode
process.env.SPARROW_SMS_TOKEN ||= 'test-stub';
process.env.CLOUDINARY_NAME ||= 'test';
process.env.CLOUDINARY_API_KEY ||= 'test';
process.env.CLOUDINARY_SECRET_KEY ||= 'test';
process.env.FCM_PROJECT_ID ||= '';
process.env.FCM_CLIENT_EMAIL ||= '';
process.env.FCM_PRIVATE_KEY ||= '';

const { createApp } = require('../../src/app');
const { createGlobalRateLimiters } = require('../../middleware/globalRateLimiters');

const createTestApp = ({
  globalRateLimiters = createGlobalRateLimiters(),
} = {}) => {
  const app = createApp({
    apiLimiter: globalRateLimiters.apiLimiter,
    searchLimiter: globalRateLimiters.searchLimiter,
  });
  return { app, globalRateLimiters };
};

const defaultTestApp = createTestApp();

module.exports = defaultTestApp.app;
module.exports.createTestApp = createTestApp;
module.exports.createAuthTestApp = require('./auth-app');

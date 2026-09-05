'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDriverAuthRouter } = require('../../../routes/authRoutes/driverAuthRoutes');

test('driver password reset routes carry send and verify rate-limit pipelines', () => {
  const middleware = (_req, _res, next) => next();
  const router = createDriverAuthRouter({
    otpVerifyLimiter: middleware,
    otpSendLimiter: middleware,
    otpPresenceLimiter: middleware,
  });
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      post: layer.route.methods.post === true,
      handlers: layer.route.stack.length,
    }));
  assert.deepEqual(routes, [
    { path: '/requestPasswordReset', post: true, handlers: 3 },
    { path: '/verifyOtpForReset', post: true, handlers: 3 },
    { path: '/resetPassword', post: true, handlers: 3 },
    { path: '/resendOtpForReset', post: true, handlers: 3 },
  ]);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const passengerOtpAuth = require('../../../src/modules/auth/passenger-otp-auth');
const {
  createPassengerAuthRouter,
} = require('../../../routes/authRoutes/passengerAuthRoutes');

const handler = (req, res, next) => next();

test('passenger OTP route applies the shared send limiter before SMS handling', () => {
  const otpSendLimiter = handler.bind(null);
  const otpPresenceLimiter = handler.bind(null);
  const otpVerifyLimiter = handler.bind(null);
  const router = createPassengerAuthRouter({
    otpSendLimiter,
    otpPresenceLimiter,
    otpVerifyLimiter,
  });

  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route);
  const sendRoute = routes.find((route) => route.path === '/sendOTP');
  const verifyRoute = routes.find((route) => route.path === '/verifyOTP');

  assert.ok(sendRoute);
  assert.ok(verifyRoute);
  assert.equal(sendRoute.methods.post, true);
  assert.deepEqual(
    sendRoute.stack.map((layer) => layer.handle),
    [otpSendLimiter, otpPresenceLimiter, passengerOtpAuth.sendOTP],
  );
  assert.deepEqual(
    verifyRoute.stack.map((layer) => layer.handle),
    [otpVerifyLimiter, passengerOtpAuth.verifyOTP],
  );
});

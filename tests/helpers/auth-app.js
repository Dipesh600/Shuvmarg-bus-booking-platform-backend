'use strict';

process.env.NODE_ENV = 'test';
process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN ||= 'test-stub';
process.env.CLOUDINARY_NAME ||= 'test';
process.env.CLOUDINARY_API_KEY ||= 'test';
process.env.CLOUDINARY_SECRET_KEY ||= 'test';

const express = require('express');
const errorHandler = require('../../src/shared/http/error-handler');
const { createOtpRateLimiters } = require('../../middleware/otpRateLimiter');
const { createLoginRateLimiters } = require('../../middleware/loginRateLimiters');
const { createUserRouter } = require('../../routes/userRoutes/userRoutes');
const { createAgentAuthRouter } = require('../../routes/authRoutes/agentAuthRoutes');
const { createBusOwnerAuthRouter } = require('../../routes/authRoutes/busOwnerAuthRoutes');
const { createPassengerAuthRouter } = require('../../routes/authRoutes/passengerAuthRoutes');
const { createActivateAuthRouter } = require('../../routes/authRoutes/activateAuthRoutes');

const createAuthTestApp = ({
  otpRateLimiters = createOtpRateLimiters(),
  loginRateLimiters = createLoginRateLimiters(),
} = {}) => {
  const app = express();
  const otp = {
    otpVerifyLimiter: otpRateLimiters.otpVerifyLimiter,
    otpSendLimiter: otpRateLimiters.otpSendLimiter,
    otpPresenceLimiter: otpRateLimiters.validatePhonePresent,
  };

  app.use(express.json());
  app.use('/api', createUserRouter({
    ...otp,
    loginRateLimiter: loginRateLimiters.loginRateLimiter,
    passwordChangeLimiter: loginRateLimiters.passwordChangeLimiter,
  }));
  app.use('/api/auth/agent', createAgentAuthRouter({
    ...otp,
    loginRateLimiter: loginRateLimiters.agentLoginRateLimiter,
  }));
  app.use('/api/auth/busowner', createBusOwnerAuthRouter({
    ...otp,
    loginRateLimiter: loginRateLimiters.busOwnerLoginRateLimiter,
  }));
  app.use('/api/auth/passenger', createPassengerAuthRouter(otp));
  app.use('/api/auth/activate', createActivateAuthRouter(otp));
  app.use(errorHandler);

  const teardown = async () => {
    await otpRateLimiters.reset();
    await loginRateLimiters.reset();
  };
  return { app, otpRateLimiters, loginRateLimiters, teardown };
};

module.exports = createAuthTestApp;

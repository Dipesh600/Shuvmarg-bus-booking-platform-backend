'use strict';

const express = require('express');
const passwordReset = require('../../src/modules/driver/auth/password-reset');
const otpLimiters = require('../../middleware/otpRateLimiter');

const createDriverAuthRouter = ({
  otpVerifyLimiter = otpLimiters.otpVerifyLimiter,
  otpSendLimiter = otpLimiters.otpSendLimiter,
  otpPresenceLimiter = otpLimiters.validatePhonePresent,
} = {}) => {
  const router = express.Router();
  router.post('/requestPasswordReset', otpSendLimiter, otpPresenceLimiter, passwordReset.requestPasswordReset);
  router.post('/verifyOtpForReset', otpVerifyLimiter, otpPresenceLimiter, passwordReset.verifyOtpForReset);
  router.post('/resetPassword', otpVerifyLimiter, otpPresenceLimiter, passwordReset.resetPassword);
  router.post('/resendOtpForReset', otpSendLimiter, otpPresenceLimiter, passwordReset.resendOtpForReset);
  return router;
};

module.exports = createDriverAuthRouter();
module.exports.createDriverAuthRouter = createDriverAuthRouter;

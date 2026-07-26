'use strict';

const rateLimit = require('express-rate-limit');
const { MemoryStore } = rateLimit;

const validatePhonePresent = (req, res, next) => {
  const phone = req.body?.phone || req.body?.emailOrPhone;
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required.',
    });
  }
  next();
};

const phoneKey = (req) => {
  const phone = req.body?.phone || req.body?.emailOrPhone || req.ip;
  return String(phone).replace(/\s+/g, '').toLowerCase();
};

const createOtpRateLimiters = ({ stores = {} } = {}) => {
  const verifyStore = stores.verifyStore || new MemoryStore();
  const sendStore = stores.sendStore || new MemoryStore();

  const otpVerifyLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    store: verifyStore,
    keyGenerator: phoneKey,
    message: {
      success: false,
      message: 'Too many verification attempts for this phone number. Please wait 10 minutes.',
      errorCode: 'OTP_VERIFY_RATE_LIMIT',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  });

  const otpSendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    store: sendStore,
    keyGenerator: (req) => req.ip,
    message: {
      success: false,
      message: 'Too many OTP requests from this device. Please wait 15 minutes.',
      errorCode: 'OTP_SEND_IP_RATE_LIMIT',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
  });

  const reset = async () => {
    await verifyStore.resetAll();
    await sendStore.resetAll();
  };

  return {
    otpVerifyLimiter,
    otpSendLimiter,
    validatePhonePresent,
    stores: { verifyStore, sendStore },
    reset,
  };
};

const productionOtpRateLimiters = createOtpRateLimiters();

module.exports = productionOtpRateLimiters.validatePhonePresent;
module.exports.validatePhonePresent = productionOtpRateLimiters.validatePhonePresent;
module.exports.otpVerifyLimiter = productionOtpRateLimiters.otpVerifyLimiter;
module.exports.otpSendLimiter = productionOtpRateLimiters.otpSendLimiter;
module.exports.createOtpRateLimiters = createOtpRateLimiters;

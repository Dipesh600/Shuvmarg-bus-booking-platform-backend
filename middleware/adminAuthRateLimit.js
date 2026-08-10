"use strict";

const rateLimit = require("express-rate-limit");

const response = { success: false, message: "Too many authentication attempts. Try again later." };

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: response,
  standardHeaders: true,
  legacyHeaders: false,
});

const adminEnrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: response,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { adminEnrollmentLimiter, adminLoginLimiter };

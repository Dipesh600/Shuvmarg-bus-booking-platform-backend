"use strict";

const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `admin-sms-replay:${req.adminInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({ success: false,
    errorCode: "SMS_REPLAY_RATE_LIMITED",
    message: "Too many SMS replay attempts. Try again in 15 minutes." }),
});

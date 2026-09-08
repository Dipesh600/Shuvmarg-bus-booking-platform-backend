"use strict";
const rateLimit = require("express-rate-limit");

// Shared across both crew roles and invitation retries.
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `bus-owner-crew-invite:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false, errorCode: "CREW_INVITE_RATE_LIMITED",
    message: "Too many crew invitations. Try again later.",
  }),
});

"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Sixty writes per hour permits one normal sale attempt per minute while
 * bounding hold churn and repeated cash-commit attempts for one agent token.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-sale:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_SALE_RATE_LIMITED",
    message: "Too many sale requests. Try again later.",
  }),
});

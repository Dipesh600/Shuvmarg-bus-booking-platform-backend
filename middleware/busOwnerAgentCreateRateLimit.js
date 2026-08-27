"use strict";

const rateLimit = require("express-rate-limit");

/** Thirty agent identities per hour supports operator onboarding batches while
 * bounding User/Agent creation and SMS work for one approved owner token. */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `bus-owner-agent-create:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_CREATE_RATE_LIMITED",
    message: "Too many agent creation requests. Try again later.",
  }),
});

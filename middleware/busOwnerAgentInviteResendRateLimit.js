"use strict";

const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `bus-owner-agent-invite:${req.userInfo?.id || req.ip}:${req.params.agentId}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_INVITATION_RATE_LIMITED",
    message: "Too many activation message attempts. Try again in 15 minutes.",
  }),
});

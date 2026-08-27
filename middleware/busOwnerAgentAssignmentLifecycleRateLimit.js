"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Thirty lifecycle writes per hour per owner, shared by suspend, reinstate and
 * revoke across all assignments. That accommodates a shift-change correction
 * while bounding the damage a stolen operator token can do before revocation.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `bus-owner-agent-assignment-lifecycle:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGNMENT_LIFECYCLE_RATE_LIMITED",
    message: "Too many assignment changes. Try again later.",
  }),
});

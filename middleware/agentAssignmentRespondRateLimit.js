"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Thirty responses per hour per agent across every invitation and both actions.
 * That leaves room for a travel agency being onboarded by many operators in one
 * sitting while still containing a stolen token that churns assignment state.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-assignment-respond:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGNMENT_RESPONSE_RATE_LIMITED",
    message: "Too many assignment responses. Try again later.",
  }),
});

"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Ten responses per hour per agent. Accept/decline are human decisions that are
 * normally made once; ten leaves room for retries across several invitations
 * while containing a stolen token that tries to churn assignment state.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-assignment-respond:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGNMENT_RESPONSE_RATE_LIMITED",
    message: "Too many assignment responses. Try again later.",
  }),
});

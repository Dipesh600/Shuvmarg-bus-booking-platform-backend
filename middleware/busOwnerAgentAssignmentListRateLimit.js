"use strict";

const rateLimit = require("express-rate-limit");

/**
 * 240 list reads per hour per owner. Pagination caps each read at fifty rows;
 * four refreshes a minute supports an active dashboard without permitting an
 * unbounded poller to keep this growing collection hot.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `bus-owner-agent-assignment-list:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGNMENT_LIST_RATE_LIMITED",
    message: "Too many assignment list requests. Try again later.",
  }),
});

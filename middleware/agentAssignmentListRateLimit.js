"use strict";

const rateLimit = require("express-rate-limit");

/** Four invitation refreshes a minute supports an active inbox while each read
 * remains capped at fifty rows and one thousand pages. */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-assignment-list:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGNMENT_LIST_RATE_LIMITED",
    message: "Too many assignment list requests. Try again later.",
  }),
});

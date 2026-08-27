"use strict";

const rateLimit = require("express-rate-limit");

/** Four refreshes a minute supports active history screens; every response is
 * capped at fifty rows and page depth at one thousand. */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-sales-read:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_SALES_READ_RATE_LIMITED",
    message: "Too many sales history requests. Try again later.",
  }),
});

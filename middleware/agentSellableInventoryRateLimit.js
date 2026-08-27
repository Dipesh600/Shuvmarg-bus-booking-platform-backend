"use strict";

const rateLimit = require("express-rate-limit");

/**
 * 240 catalogue reads per hour per agent. Each brand group is page-bounded to
 * fifty trips and page depth is capped, so four refreshes a minute supports
 * an active sales screen without allowing an unbounded inventory poller.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent-sellable-inventory:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_INVENTORY_RATE_LIMITED",
    message: "Too many inventory requests. Try again later.",
  }),
});

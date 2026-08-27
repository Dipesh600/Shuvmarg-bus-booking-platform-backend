"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Enumeration control for the agent code preview.
 *
 * 30 in 15 minutes, keyed per owner. Higher than the 5 on
 * adminOwnerAccessRateLimit because that one guards an outbound message and this
 * one guards a read an operator will legitimately repeat — onboarding several
 * agents in a sitting, mistyping a code, refreshing the page. Five would break
 * the workflow the endpoint exists for.
 *
 * It is still a hard stop on enumeration. The code space is 32^6 behind a check
 * symbol, so at this rate a single account needs on the order of ten thousand
 * years to guess one code, and the limiter caps the damage from a leaked token
 * rather than being the only thing standing in the way.
 *
 * Keyed on the owner id first so that one operator cannot be locked out by
 * another behind the same NAT, and falling back to IP only when there is no
 * verified id — which the router's auth middleware should already have ruled
 * out.
 */
module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `bus-owner-agent-lookup:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_LOOKUP_RATE_LIMITED",
    message: "Too many agent code lookups. Try again in 15 minutes.",
  }),
});

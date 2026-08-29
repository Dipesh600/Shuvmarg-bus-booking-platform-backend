"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Write-side control for agent invitations.
 *
 * 20 in an hour, keyed per owner. Lower than the 30-in-15-minutes on the lookup
 * because this endpoint writes: each call creates a relationship someone has to
 * answer, and an operator onboarding their whole counter staff in one sitting is
 * still nowhere near twenty. A read an operator repeats by refreshing the page is
 * a different shape of traffic from an invite they cannot un-send.
 *
 * It also caps the blast radius of a leaked owner token, which could otherwise
 * spray invitations at every agent code it could find and leave the agents
 * declining them one by one.
 *
 * Keyed on the owner id first so one operator cannot be locked out by another
 * behind the same NAT, falling back to IP only when there is no verified id —
 * which the router's auth middleware should already have ruled out.
 */
module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `bus-owner-agent-assign:${req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "AGENT_ASSIGN_RATE_LIMITED",
    message: "Too many agent invitations. Try again later.",
  }),
});

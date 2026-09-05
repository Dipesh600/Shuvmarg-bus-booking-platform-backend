"use strict";
const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `admin-crew-invite:${req.adminInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({ success: false,
    errorCode: "ADMIN_CREW_INVITE_RATE_LIMITED",
    message: "Too many staff invitations. Try again later.",
  }),
});

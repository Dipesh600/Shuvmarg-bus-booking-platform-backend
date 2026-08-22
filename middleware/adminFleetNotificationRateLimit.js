"use strict";

const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin-fleet-sms:${req.adminInfo.id}:${req.params.fleetId}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "FLEET_NOTIFICATION_RATE_LIMITED",
    message: "Too many fleet message attempts. Try again in 15 minutes.",
  }),
});

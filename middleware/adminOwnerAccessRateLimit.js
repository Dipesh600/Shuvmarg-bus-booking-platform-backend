"use strict";

const rateLimit = require("express-rate-limit");

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin-owner-access:${req.adminInfo?.id || req.ip}:${req.params.userId || "create"}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "OWNER_ACCESS_NOTIFICATION_RATE_LIMITED",
    message: "Too many operator access message attempts. Try again in 15 minutes.",
  }),
});

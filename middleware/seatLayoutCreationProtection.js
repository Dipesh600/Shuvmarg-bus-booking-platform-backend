"use strict";

const rateLimit = require("express-rate-limit");

const MAX_SEAT_LAYOUT_REQUEST_BYTES = 300 * 1024;

function rejectOversizedSeatLayoutRequest(req, res, next) {
  const raw = req.headers["content-length"];
  if (raw === undefined) return next();
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length < 0) {
    return res.status(400).json({ success: false, errorCode: "SEAT_LAYOUT_INVALID_CONTENT_LENGTH", message: "Invalid seat-layout request size." });
  }
  if (length > MAX_SEAT_LAYOUT_REQUEST_BYTES) {
    return res.status(413).json({ success: false, errorCode: "SEAT_LAYOUT_REQUEST_TOO_LARGE", message: "Seat-layout request is too large." });
  }
  return next();
}

const seatLayoutCreationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `seat-layout-create:${String(req.userInfo?.id || req.adminInfo?.id || req.ip)}`,
  handler: (_req, res) => res.status(429).json({
    success: false,
    errorCode: "SEAT_LAYOUT_CREATION_RATE_LIMITED",
    message: "Too many seat-layout changes. Try again later.",
  }),
});

module.exports = {
  MAX_SEAT_LAYOUT_REQUEST_BYTES,
  rejectOversizedSeatLayoutRequest,
  seatLayoutCreationRateLimiter,
};

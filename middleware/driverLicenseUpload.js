"use strict";

const fileUpload = require("express-fileupload");
const rateLimit = require("express-rate-limit");
const { MAX_INDIVIDUAL_FILE_SIZE } = require("../src/modules/bus-owner/kyc-submission/kyc-document.policy");

const MAX_TEXT_FIELDS = 10;
const MAX_REQUEST_SIZE = MAX_INDIVIDUAL_FILE_SIZE + 256 * 1024;

function rejectOversizedDriverUpload(req, res, next) {
  const rawLength = req.headers["content-length"];
  if (rawLength === undefined) return next();
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 0) {
    return res.status(400).json({ success: false, errorCode: "DRIVER_UPLOAD_INVALID_LENGTH",
      message: "Invalid driver upload request size." });
  }
  if (length > MAX_REQUEST_SIZE) {
    return res.status(413).json({ success: false, errorCode: "DRIVER_UPLOAD_TOO_LARGE",
      message: "The driving-license upload must be 5 MB or smaller." });
  }
  return next();
}

const driverUploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: req => `driver-license:${req.adminInfo?.id || req.userInfo?.id || req.ip}`,
  handler: (_req, res) => res.status(429).json({ success: false,
    errorCode: "DRIVER_UPLOAD_RATE_LIMITED",
    message: "Too many unsuccessful driver uploads. Try again later." }),
});

const parseDriverLicenseUpload = fileUpload({
  limits: { fileSize: MAX_INDIVIDUAL_FILE_SIZE, files: 1, fields: MAX_TEXT_FIELDS,
    parts: MAX_TEXT_FIELDS + 1, fieldSize: 1024 },
  abortOnLimit: true,
  uploadTimeout: 30_000,
  responseOnLimit: "Driver license upload limit exceeded.",
  limitHandler: (_req, res) => {
    if (!res.headersSent) res.status(413).json({ success: false,
      errorCode: "DRIVER_UPLOAD_TOO_LARGE",
      message: "Upload one JPG, PNG or PDF driving-license document up to 5 MB." });
  },
});

module.exports = {
  MAX_REQUEST_SIZE,
  rejectOversizedDriverUpload,
  driverUploadRateLimiter,
  parseDriverLicenseUpload,
};

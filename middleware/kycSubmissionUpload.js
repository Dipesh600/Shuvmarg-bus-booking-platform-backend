"use strict";

const fileUpload = require("express-fileupload");
const rateLimit = require("express-rate-limit");
const {
  MAX_INDIVIDUAL_FILE_SIZE,
  MAX_TOTAL_FILES,
} = require("../src/modules/bus-owner/kyc-submission/kyc-document.policy");
const {
  ALLOWED_FIELDS,
} = require("../src/modules/bus-owner/kyc-submission/bus-owner-onboarding.validator");

// Keep multipart capacity aligned with the onboarding contract. This prevents
// valid fields from being silently truncated before domain validation runs.
const MAX_TEXT_FIELDS = ALLOWED_FIELDS.size;
const MAX_TEXT_FIELD_SIZE = 1024;
const MAX_MULTIPART_OVERHEAD = 1024 * 1024;
const MAX_KYC_PARTS = MAX_TOTAL_FILES + MAX_TEXT_FIELDS;
const MAX_KYC_REQUEST_SIZE =
  MAX_INDIVIDUAL_FILE_SIZE * MAX_TOTAL_FILES + MAX_MULTIPART_OVERHEAD;

function rejectOversizedKycRequest(req, res, next) {
  const rawLength = req.headers["content-length"];
  if (rawLength === undefined) return next();

  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return res.status(400).json({
      success: false,
      code: "KYC_INVALID_CONTENT_LENGTH",
      message: "Invalid upload request size.",
    });
  }

  if (contentLength > MAX_KYC_REQUEST_SIZE) {
    return res.status(413).json({
      success: false,
      code: "KYC_REQUEST_TOO_LARGE",
      message: "The complete KYC upload exceeds the allowed request size.",
    });
  }

  return next();
}

const kycSubmissionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `bus-owner-kyc:${String(req.userInfo?.id || "missing")}`,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      code: "KYC_SUBMISSION_RATE_LIMITED",
      message: "Too many unsuccessful submission attempts. Try again in 15 minutes.",
    }),
});

const parseKycSubmissionUpload = fileUpload({
  limits: {
    fileSize: MAX_INDIVIDUAL_FILE_SIZE,
    files: MAX_TOTAL_FILES,
    fields: MAX_TEXT_FIELDS,
    parts: MAX_KYC_PARTS,
    fieldSize: MAX_TEXT_FIELD_SIZE,
  },
  abortOnLimit: true,
  uploadTimeout: 30_000,
  responseOnLimit: "KYC upload limit exceeded.",
  limitHandler: (_req, res) => {
    if (res.headersSent) return;
    res.status(413).json({
      success: false,
      code: "KYC_FILE_TOO_LARGE",
      message: "Each document must be 5 MB or smaller.",
    });
  },
});

module.exports = {
  MAX_KYC_REQUEST_SIZE,
  MAX_KYC_PARTS,
  MAX_TEXT_FIELDS,
  rejectOversizedKycRequest,
  kycSubmissionRateLimiter,
  parseKycSubmissionUpload,
};

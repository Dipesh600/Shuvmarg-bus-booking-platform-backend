"use strict";

const { ApiError } = require("../../../contracts");
const {
  KycDocumentValidationError,
  KycMalwareScanError,
  BusOwnerOnboardingValidationError,
} = require("./kyc-submission.errors");

function handleKycSubmissionError(error, res) {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof BusOwnerOnboardingValidationError) {
    const body = {
      success: false,
      code: error.code,
      message: error.message,
    };
    if (error.field) body.field = error.field;
    return res.status(error.statusCode || 400).json(body);
  }

  if (
    error instanceof KycDocumentValidationError ||
    error instanceof KycMalwareScanError ||
    error.name === "KycDocumentValidationError" ||
    error.name === "KycMalwareScanError" ||
    error.name === "KycSubmissionStateError"
  ) {
    const body = {
      success: false,
      code: error.code,
      message: error.message,
    };
    if (error.field) {
      body.field = error.field;
    }
    return res.status(error.statusCode || 400).json(body);
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      code: "KYC_FILE_TOO_LARGE",
      message: "Uploaded file size exceeds maximum limit of 5 MB.",
    });
  }
  if (error.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({
      success: false,
      code: "KYC_TOO_MANY_FILES",
      message: "Exceeded maximum allowed document count limit.",
    });
  }

  console.error("KYC submission error:", error);
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}

module.exports = { handleKycSubmissionError };

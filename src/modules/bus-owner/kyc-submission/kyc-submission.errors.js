"use strict";

class KycDocumentValidationError extends Error {
  constructor(code, message, field = null, statusCode = 400) {
    super(message);
    this.name = "KycDocumentValidationError";
    this.code = code;
    this.field = field;
    this.statusCode = statusCode;
  }
}

class KycSubmissionStateError extends Error {
  constructor(code, message, statusCode = 409) {
    super(message);
    this.name = "KycSubmissionStateError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

class KycMalwareScanError extends Error {
  constructor(code, message, field = null, statusCode = 503) {
    super(message);
    this.name = "KycMalwareScanError";
    this.code = code;
    this.field = field;
    this.statusCode = statusCode;
  }
}

class BusOwnerOnboardingValidationError extends Error {
  constructor(code, message, field = null, statusCode = 400) {
    super(message);
    this.name = "BusOwnerOnboardingValidationError";
    this.code = code;
    this.field = field;
    this.statusCode = statusCode;
  }
}

module.exports = {
  KycDocumentValidationError,
  KycMalwareScanError,
  KycSubmissionStateError,
  BusOwnerOnboardingValidationError,
};

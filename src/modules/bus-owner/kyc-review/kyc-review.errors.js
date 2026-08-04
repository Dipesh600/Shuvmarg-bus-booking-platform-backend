"use strict";

class KycReviewError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "KycReviewError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { KycReviewError };

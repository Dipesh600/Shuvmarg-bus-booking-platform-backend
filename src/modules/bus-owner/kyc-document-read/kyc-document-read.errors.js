"use strict";

class KycDocumentReadError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "KycDocumentReadError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { KycDocumentReadError };

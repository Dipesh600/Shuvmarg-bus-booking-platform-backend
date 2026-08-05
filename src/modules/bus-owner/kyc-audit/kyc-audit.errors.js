"use strict";

class KycAuditError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = "KycAuditError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { KycAuditError };

"use strict";

class AdminOwnerProfileError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = "AdminOwnerProfileError";
    this.code = code;
    this.statusCode = statusCode;
    if (details.field) this.field = details.field;
    if (details.fields) this.fields = details.fields;
  }
}

module.exports = { AdminOwnerProfileError };

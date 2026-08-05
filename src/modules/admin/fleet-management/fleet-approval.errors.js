"use strict";

class FleetApprovalError extends Error {
  constructor(code, message, statusCode = 400, field = null) {
    super(message);
    this.name = "FleetApprovalError";
    this.code = code;
    this.statusCode = statusCode;
    if (field) this.field = field;
  }
}

module.exports = { FleetApprovalError };

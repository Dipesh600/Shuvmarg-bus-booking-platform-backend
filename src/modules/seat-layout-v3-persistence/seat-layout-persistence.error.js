"use strict";

class SeatLayoutPersistenceError extends Error {
  constructor(code, message, statusCode = 409, details = null) {
    super(message);
    this.name = "SeatLayoutPersistenceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

module.exports = { SeatLayoutPersistenceError };

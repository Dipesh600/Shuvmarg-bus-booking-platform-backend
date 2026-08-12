"use strict";

class SeatLayoutError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "SeatLayoutError";
    this.code = "INVALID_SEAT_LAYOUT";
    this.statusCode = 422;
    this.details = details;
  }
}

module.exports = { SeatLayoutError };

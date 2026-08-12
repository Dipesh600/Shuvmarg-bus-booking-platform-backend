"use strict";

class SeatTemplateError extends Error {
  constructor(code, message, statusCode, details = null) {
    super(message);
    this.name = "SeatTemplateError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const notFound = () => new SeatTemplateError(
  "SEAT_TEMPLATE_NOT_FOUND", "Seat template not found.", 404
);

module.exports = { SeatTemplateError, notFound };

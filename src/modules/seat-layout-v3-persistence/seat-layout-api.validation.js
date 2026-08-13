"use strict";

const { SeatLayoutPersistenceError } = require("./seat-layout-persistence.error");

function requiredBodyId(req, field) {
  const value = req.body?.[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_INPUT_INVALID", `${field} is required.`, 422, { field }
    );
  }
  return value.trim();
}

module.exports = { requiredBodyId };

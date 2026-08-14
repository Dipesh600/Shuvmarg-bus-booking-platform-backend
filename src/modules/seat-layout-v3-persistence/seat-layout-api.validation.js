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

function requiredText(value, field, { min = 1, max = 120, pattern } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max || (pattern && !pattern.test(normalized))) {
    throw new SeatLayoutPersistenceError(
      "SEAT_LAYOUT_INPUT_INVALID", `${field} is invalid.`, 422, { field }
    );
  }
  return normalized;
}

function validateTemplateIdentity(input) {
  return {
    templateCode: requiredText(input?.templateCode, "templateCode", {
      min: 3, max: 40, pattern: /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/,
    }).toUpperCase(),
    name: requiredText(input?.name, "name", { min: 2, max: 120 }),
  };
}

function optionalSummary(value) {
  if (value == null || value === "") return null;
  return requiredText(value, "changeSummary", { min: 3, max: 500 });
}

module.exports = { requiredBodyId, validateTemplateIdentity, optionalSummary };

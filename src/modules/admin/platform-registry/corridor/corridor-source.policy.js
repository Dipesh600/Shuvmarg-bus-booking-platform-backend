"use strict";

const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

const WRITABLE_CORRIDOR_SOURCES = ["ADMIN", "ROUTE_REQUEST"];

function resolveWritableCorridorSource(value) {
  const source = String(value || "ADMIN").trim().toUpperCase();
  if (source === "DISCOVERY") {
    throw corridorError(
      "DISCOVERY_CORRIDOR_RETIRED",
      "New corridors can no longer be created from Route Discovery. Create the corridor through the platform registry.",
      409
    );
  }
  if (!WRITABLE_CORRIDOR_SOURCES.includes(source)) {
    throw corridorError("INVALID_CORRIDOR_SOURCE", "Corridor source is invalid.");
  }
  return source;
}

module.exports = { WRITABLE_CORRIDOR_SOURCES, resolveWritableCorridorSource };

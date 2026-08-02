"use strict";

const { corridorError } = require("./corridor-errors.js");

function endpointId(value) {
  return String(value?._id || value?.id || value || "").trim();
}

function buildCorridorPairKey(originId, destinationId) {
  const origin = endpointId(originId);
  const destination = endpointId(destinationId);
  if (!origin || !destination) {
    throw corridorError(
      "INVALID_CORRIDOR_ENDPOINT", "Both corridor endpoints are required."
    );
  }
  if (origin === destination) {
    throw corridorError(
      "SAME_CORRIDOR_ENDPOINT", "Corridor origin and destination must differ."
    );
  }
  return [origin, destination].sort().join("|");
}

module.exports = { buildCorridorPairKey, endpointId };

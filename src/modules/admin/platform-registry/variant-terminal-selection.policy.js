"use strict";

const { routeVariantError } = require("./route-variant-errors.js");

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function assertSelectedTerminalsMatchSequence(
  variant, originStopId, destinationStopId
) {
  const hasOrigin = Boolean(variant.originTerminalStopId);
  const hasDestination = Boolean(variant.destinationTerminalStopId);
  if (hasOrigin !== hasDestination) {
    throw routeVariantError(
      "INCOMPLETE_VARIANT_TERMINALS",
      "A variant must define both physical terminals or neither."
    );
  }
  if (variant.definitionSource === "GOOGLE_ROUTE_REVIEW" && !hasOrigin) {
    throw routeVariantError(
      "VARIANT_TERMINALS_REQUIRED",
      "A map-reviewed variant requires both physical terminals before activation."
    );
  }
  if (!hasOrigin) return;
  if (!sameId(variant.originTerminalStopId, originStopId) ||
      !sameId(variant.destinationTerminalStopId, destinationStopId)) {
    throw routeVariantError(
      "VARIANT_TERMINAL_SEQUENCE_MISMATCH",
      "The saved route-stop sequence must start and end at the selected physical terminals."
    );
  }
}

module.exports = { assertSelectedTerminalsMatchSequence };

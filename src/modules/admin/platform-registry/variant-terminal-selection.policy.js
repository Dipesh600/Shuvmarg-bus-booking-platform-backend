"use strict";

const { routeVariantError } = require("./route-variant-errors.js");

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right));
}

function assertSelectedTerminalsMatchSequence(
  variant, originStopId, destinationStopId
) {
  if (variant.originTerminalStopId && !sameId(variant.originTerminalStopId, originStopId)) {
    throw routeVariantError(
      "VARIANT_TERMINAL_SEQUENCE_MISMATCH",
      "The saved route-stop sequence must start at the selected physical origin terminal."
    );
  }
  if (variant.destinationTerminalStopId && !sameId(variant.destinationTerminalStopId, destinationStopId)) {
    throw routeVariantError(
      "VARIANT_TERMINAL_SEQUENCE_MISMATCH",
      "The saved route-stop sequence must end at the selected physical destination terminal."
    );
  }
}

module.exports = { assertSelectedTerminalsMatchSequence };

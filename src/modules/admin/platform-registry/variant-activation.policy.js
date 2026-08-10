"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const Stop = require("../../../../models/stopModel.js");
const {
  assertVariantTerminalScope,
} = require("./variant-terminal-scope.policy.js");
const {
  assertSelectedTerminalsMatchSequence,
} = require("./variant-terminal-selection.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

function assertStoredSequenceIntegrity(sequence) {
  const stopIds = new Set();
  let previousDuration = -1;
  sequence.forEach((row, index) => {
    if (!Number.isSafeInteger(row.sequence) || row.sequence !== index + 1) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_SEQUENCE",
        "Route stops must have consecutive sequence numbers before activation."
      );
    }
    const stopId = String(row.stopId);
    if (stopIds.has(stopId)) {
      throw routeVariantError(
        "DUPLICATE_ROUTE_STOP", "A route stop appears more than once in this variant."
      );
    }
    stopIds.add(stopId);
    const duration = row.durationFromOriginMins ??
      row.estimatedMinutesFromOrigin ?? 0;
    if (!Number.isFinite(Number(duration)) || Number(duration) < previousDuration) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_TIMING",
        "Route stop durations must be valid and must not move backwards."
      );
    }
    previousDuration = Number(duration);
  });
}

async function assertVariantCanActivate(variant) {
  if (!String(variant.name || "").trim()) {
    throw routeVariantError(
      "VARIANT_NAME_REQUIRED",
      "A variant needs an approved route name before activation."
    );
  }
  const sequence = await RouteStop.find({ variantId: variant._id })
    .sort({ sequence: 1 }).lean();
  if (sequence.length < 2) {
    throw routeVariantError(
      "VARIANT_NOT_READY",
      "A variant needs at least two ordered route stops before activation.",
      409
    );
  }
  assertStoredSequenceIntegrity(sequence);
  assertSelectedTerminalsMatchSequence(
    variant, sequence[0].stopId, sequence.at(-1).stopId
  );
  const stopIds = sequence.map((row) => row.stopId);
  const validStops = await Stop.countDocuments({
    _id: { $in: stopIds }, status: "ACTIVE",
    verificationStatus: "VERIFIED", isRouteStop: true,
  });
  if (validStops !== stopIds.length) {
    throw routeVariantError(
      "INVALID_ROUTE_STOP",
      "Every variant sequence item must be an active, verified operational route stop."
    );
  }
  await assertVariantTerminalScope({
    corridor: variant.corridorId,
    direction: variant.direction,
    originTerminalStopId: sequence[0].stopId,
    destinationTerminalStopId: sequence.at(-1).stopId,
  });
}

module.exports = { assertStoredSequenceIntegrity, assertVariantCanActivate };

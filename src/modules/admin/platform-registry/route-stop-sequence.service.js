"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { getVariantById } = require("./route-variant-registry.service.js");
const { normalizeSequenceInput } = require("./route-stop-sequence.policy.js");
const {
  replaceVariantStopSequence,
} = require("./route-stop-sequence.persistence.js");
const {
  assertVariantTerminalScope,
} = require("./variant-terminal-scope.policy.js");
const {
  assertSelectedTerminalsMatchSequence,
} = require("./variant-terminal-selection.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");
const {
  VARIANT_WRITE_CONTEXT,
  assertVariantSequenceMutable,
} = require("./variant-lifecycle.policy.js");

function mappedStops(variantId, stops, stopMap) {
  return stops.map((stop) => ({
    variantId,
    stopId: stopMap[stop.stopCode.toUpperCase()],
    sequence: stop.sequence,
    isMajor: stop.isMajor,
    distanceFromOriginKm: stop.distanceFromOriginKm,
    durationFromOriginMins: stop.durationFromOriginMins,
    estimatedMinutesFromOrigin: stop.durationFromOriginMins,
  }));
}

async function resolveOperationalStops(stops, session = null) {
  const codes = stops.map((stop) => stop.stopCode);
  let query = Stop.find({ code: { $in: codes } });
  if (session && typeof query.session === "function") query = query.session(session);
  const registryStops = await query;
  const stopMap = Object.fromEntries(
    registryStops.map((stop) => [String(stop.code).toUpperCase(), stop])
  );
  const missing = codes.filter((code) => !stopMap[code]);
  if (missing.length > 0) {
    throw routeVariantError(
      "ROUTE_STOP_NOT_FOUND",
      `Stops not found in registry: ${missing.join(", ")}`,
      404,
      { stopCodes: missing }
    );
  }
  const ineligible = codes.filter((code) => {
    const stop = stopMap[code];
    return stop.status !== "ACTIVE" ||
      stop.verificationStatus !== "VERIFIED" || stop.isRouteStop !== true;
  });
  if (ineligible.length > 0) {
    throw routeVariantError(
      "INVALID_ROUTE_STOP",
      `Every route stop must be active, verified and operational: ${ineligible.join(", ")}.`,
      400,
      { stopCodes: ineligible }
    );
  }
  return Object.fromEntries(
    Object.entries(stopMap).map(([code, stop]) => [code, stop._id])
  );
}

async function setVariantStops(
  variantId, stops,
  { writeContext = VARIANT_WRITE_CONTEXT.INTERNAL_WORKFLOW, session = null } = {}
) {
  const variant = await getVariantById(variantId, { session });
  assertVariantSequenceMutable(variant, writeContext);
  const normalizedStops = normalizeSequenceInput(stops);
  const stopMap = await resolveOperationalStops(normalizedStops, session);
  const rows = mappedStops(variantId, normalizedStops, stopMap);
  assertSelectedTerminalsMatchSequence(
    variant, rows[0].stopId, rows.at(-1).stopId
  );
  await assertVariantTerminalScope({
    corridor: variant.corridorId,
    direction: variant.direction,
    originTerminalStopId: rows[0].stopId,
    destinationTerminalStopId: rows.at(-1).stopId,
    session,
  });
  return replaceVariantStopSequence(variantId, rows, { session });
}

function getStopsForVariant(variantId) {
  return RouteStop.find({ variantId })
    .populate("stopId", "name code type province district municipality")
    .sort({ sequence: 1 })
    .lean();
}

module.exports = { setVariantStops, getStopsForVariant };

"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");

const TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s(AM|PM)$/i;

function failure(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_ROUTE_CONFIG_PAYLOAD";
  return error;
}

function idOf(value) {
  return value ? String(value._id || value.id || value) : null;
}

function assertUniqueSubset(values, allowedIds, label) {
  const ids = (values || []).map(idOf).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw failure(`${label} contains duplicate stops.`);
  const invalid = ids.filter((id) => !allowedIds.has(id));
  if (invalid.length) throw failure(`${label} contains stops outside the selected route.`);
  return ids;
}

function assertChildRows(rows, activeIds, label) {
  const ids = (rows || []).map((row) => idOf(row?.stopId)).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw failure(`${label} contains duplicate stop entries.`);
  if (ids.some((id) => !activeIds.has(id))) {
    throw failure(`${label} can only reference stops served by this bus.`);
  }
}

function assertValidTime(value, label, required) {
  const time = typeof value === "string" ? value.trim() : "";
  if (!time && !required) return;
  if (!TIME_PATTERN.test(time)) throw failure(`${label} must use a valid 12-hour time.`);
}

function assertTiming(activeIds, rows, status, label) {
  assertChildRows(rows, activeIds, label);
  const byStop = new Map((rows || []).map((row) => [idOf(row.stopId), row]));
  const orderedIds = [...activeIds];
  for (const [index, stopId] of orderedIds.entries()) {
    const timing = byStop.get(stopId);
    const required = status === "ACTIVE";
    if (required && !timing) throw failure(`${label} is missing a served stop.`);
    if (!timing) continue;
    assertValidTime(timing.estimatedArrival, `${label} arrival`, required && index > 0);
    assertValidTime(
      timing.estimatedDeparture,
      `${label} departure`,
      required && index === 0
    );
  }
}

async function routeStopIds(variantId) {
  const rows = await RouteStop.find({ variantId }).select("stopId").lean();
  return new Set(rows.map((row) => idOf(row.stopId)).filter(Boolean));
}

async function assertValidRouteConfigPayload(payload) {
  const variant = await RouteVariant.findById(payload.variantId)
    .select("_id returnVariantId")
    .lean();
  if (!variant) throw failure("Route variant not found.");

  const allowed = await routeStopIds(payload.variantId);
  const active = assertUniqueSubset(payload.activeStops, allowed, "Served stops");
  if (payload.status === "ACTIVE" && active.length < 2) {
    throw failure("Choose at least the starting and destination stops before completing setup.");
  }
  const activeSet = new Set(active);
  assertChildRows(payload.boardingConfig, activeSet, "Boarding configuration");
  assertTiming(activeSet, payload.timingConfig, payload.status, "Stop timings");

  if (variant.returnVariantId && (payload.returnActiveStops || []).length) {
    const returnAllowed = await routeStopIds(variant.returnVariantId);
    const returnActive = assertUniqueSubset(
      payload.returnActiveStops,
      returnAllowed,
      "Return served stops"
    );
    const returnSet = new Set(returnActive);
    assertChildRows(payload.returnBoardingConfig, returnSet, "Return boarding configuration");
    assertTiming(returnSet, payload.returnTimingConfig, payload.status, "Return stop timings");
  }
}

function assertValidRouteConfigDocument(config) {
  return assertValidRouteConfigPayload({
    variantId: config.variantId,
    status: config.status,
    activeStops: config.activeStops,
    boardingConfig: config.boardingConfig,
    timingConfig: config.timingConfig,
    returnActiveStops: config.returnActiveStops,
    returnBoardingConfig: config.returnBoardingConfig,
    returnTimingConfig: config.returnTimingConfig,
  });
}

module.exports = { assertValidRouteConfigDocument, assertValidRouteConfigPayload };

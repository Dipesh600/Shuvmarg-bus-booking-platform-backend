"use strict";

const { routeVariantError } = require("./route-variant-errors.js");

function asNonNegativeNumber(value, label, index, defaultValue = null) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw routeVariantError(
      "INVALID_ROUTE_STOP_TIMING",
      `${label} for stop ${index + 1} must be a non-negative number.`
    );
  }
  return number;
}

function resolveDuration(stop, index) {
  const duration = asNonNegativeNumber(
    stop.durationFromOriginMins, "durationFromOriginMins", index
  );
  const legacy = asNonNegativeNumber(
    stop.estimatedMinutesFromOrigin, "estimatedMinutesFromOrigin", index
  );
  if (duration !== null && legacy !== null && duration !== legacy) {
    throw routeVariantError(
      "INCONSISTENT_ROUTE_STOP_TIMING",
      `Stop ${index + 1} has conflicting duration fields.`
    );
  }
  return duration ?? legacy ?? 0;
}

function normalizeSequenceInput(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw routeVariantError(
      "INVALID_ROUTE_STOP_SEQUENCE",
      "A variant requires at least two ordered route stops."
    );
  }
  const codes = new Set();
  const sequences = new Set();
  const normalized = stops.map((stop, index) => {
    const code = String(stop?.stopCode || "").trim().toUpperCase();
    if (!code) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP", `Stop ${index + 1} requires a stopCode.`
      );
    }
    if (codes.has(code)) {
      throw routeVariantError(
        "DUPLICATE_ROUTE_STOP", `Stop ${code} appears more than once.`
      );
    }
    codes.add(code);
    const sequence = Number(stop.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_SEQUENCE",
        `Stop ${code} must have a positive whole-number sequence.`
      );
    }
    if (sequences.has(sequence)) {
      throw routeVariantError(
        "DUPLICATE_ROUTE_STOP_SEQUENCE",
        `Sequence ${sequence} is assigned more than once.`
      );
    }
    sequences.add(sequence);
    if (stop.isMajor !== undefined && typeof stop.isMajor !== "boolean") {
      throw routeVariantError(
        "INVALID_ROUTE_STOP", `isMajor for stop ${code} must be a boolean.`
      );
    }
    return {
      stopCode: code,
      sequence,
      isMajor: stop.isMajor ?? true,
      durationFromOriginMins: resolveDuration(stop, index),
      distanceFromOriginKm: asNonNegativeNumber(
        stop.distanceFromOriginKm, "distanceFromOriginKm", index
      ),
    };
  }).sort((left, right) => left.sequence - right.sequence);

  let previousDuration = -1;
  let previousDistance = null;
  normalized.forEach((stop, index) => {
    if (stop.sequence !== index + 1) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_SEQUENCE",
        "Route stop sequences must start at 1 and be consecutive."
      );
    }
    if (stop.durationFromOriginMins < previousDuration) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_TIMING",
        "Route stop durations must not move backwards along the route."
      );
    }
    if (previousDistance !== null && stop.distanceFromOriginKm !== null &&
        stop.distanceFromOriginKm < previousDistance) {
      throw routeVariantError(
        "INVALID_ROUTE_STOP_DISTANCE",
        "Route stop distances must not move backwards along the route."
      );
    }
    previousDuration = stop.durationFromOriginMins;
    if (stop.distanceFromOriginKm !== null) {
      previousDistance = stop.distanceFromOriginKm;
    }
  });
  return normalized;
}

module.exports = { normalizeSequenceInput };

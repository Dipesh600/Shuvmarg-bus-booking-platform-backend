"use strict";

const {
  normalizeBoardingCoordinates,
} = require("./boarding-location-coordinates.js");
const { boardingLocationError } = require("./boarding-location-errors.js");

function supportsUsage(option, usage) {
  return option.usage === "BOTH" || option.usage === usage;
}

function activeLocationOf(option) {
  const location = option.boardingLocationId || option.location;
  if (!location || typeof location !== "object") return null;
  if (location.status !== "ACTIVE" ||
      location.verificationStatus !== "VERIFIED") return null;
  return location;
}

function mapConfiguredOption(option, usage, sourceLayer) {
  if (option.status !== "ACTIVE" || !supportsUsage(option, usage)) return null;
  const location = activeLocationOf(option);
  if (!location) return null;
  try {
    const coordinates = normalizeBoardingCoordinates(location.coordinates);
    return {
      sourceType: "BOARDING_LOCATION",
      sourceLayer,
      usage,
      stopId: String(location.stopId?._id || location.stopId),
      boardingLocationId: String(location._id || location.id),
      assignmentId: option._id || option.id ? String(option._id || option.id) : null,
      name: option.displayName || location.name,
      canonicalName: location.name,
      landmark: location.landmark || null,
      address: location.address || null,
      reportingInstructions: option.reportingInstructions || null,
      coordinates,
    };
  } catch (_error) {
    return null;
  }
}

function optionsFromLayer(options, usage, sourceLayer) {
  return (options || [])
    .map((option) => mapConfiguredOption(option, usage, sourceLayer))
    .filter(Boolean);
}

function makeStopFallback(stop, usage) {
  const eligible = stop && stop.status === "ACTIVE" &&
    stop.verificationStatus === "VERIFIED" && stop.isRouteStop === true;
  if (!eligible) return null;
  try {
    return {
      sourceType: "STOP_FALLBACK",
      sourceLayer: "STOP",
      usage,
      stopId: String(stop._id || stop.id),
      boardingLocationId: null,
      assignmentId: null,
      name: stop.name,
      canonicalName: stop.name,
      landmark: null,
      address: null,
      reportingInstructions: "Board at the registered stop location.",
      coordinates: normalizeBoardingCoordinates(stop.coordinates),
    };
  } catch (_error) {
    return null;
  }
}

function resolveBoardingOptions({
  stop, usage, tripOptions, serviceOptions, operatorOptions,
}) {
  if (!["PICKUP", "DROP"].includes(usage)) {
    throw boardingLocationError(
      "INVALID_BOARDING_USAGE", "Boarding usage must be PICKUP or DROP."
    );
  }
  for (const [sourceLayer, options] of [
    ["TRIP", tripOptions],
    ["SERVICE", serviceOptions],
    ["OPERATOR", operatorOptions],
  ]) {
    const resolved = optionsFromLayer(options, usage, sourceLayer);
    if (resolved.length > 0) return resolved;
  }
  const fallback = makeStopFallback(stop, usage);
  if (fallback) return [fallback];
  throw boardingLocationError(
    "BOARDING_CONFIGURATION_MISSING",
    `No valid ${usage.toLocaleLowerCase()} location is configured for this stop.`,
    409
  );
}

module.exports = { resolveBoardingOptions };

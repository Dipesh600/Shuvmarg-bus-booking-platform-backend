"use strict";

const mongoose = require("mongoose");
const { fleetRouteError } = require("./fleet-route-errors.js");

const USAGES = new Set(["PICKUP", "DROP", "BOTH"]);
const BOARDING_MODES = new Set(["STOP_FALLBACK", "BOARDING_LOCATIONS"]);

function sanitizeText(val, maxLen = 200) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

function validateCoordinates(coords) {
  if (!coords) return null;
  const { lat, lng } = coords;
  if (lat == null && lng == null) return null;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || numLat < -90 || numLat > 90) {
    throw fleetRouteError("INVALID_COORDINATES", "Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(numLng) || numLng < -180 || numLng > 180) {
    throw fleetRouteError("INVALID_COORDINATES", "Longitude must be between -180 and 180.");
  }
  return { lat: numLat, lng: numLng };
}

function validateCustomBoardingPoints(points) {
  if (!Array.isArray(points)) return [];
  const sanitized = [];
  const keys = new Set();
  for (const point of points) {
    if (!point || typeof point !== "object") continue;
    const clientKey = sanitizeText(point.clientKey, 80);
    const name = sanitizeText(point.name, 120);
    if (!clientKey || !name) {
      throw fleetRouteError("INVALID_CUSTOM_BOARDING_POINT", "Every custom boarding point must have a name.");
    }
    if (keys.has(clientKey)) {
      throw fleetRouteError("DUPLICATE_CUSTOM_BOARDING_POINT", "Custom boarding points must be unique.");
    }
    keys.add(clientKey);
    sanitized.push({
      clientKey,
      name,
      counterNumber: sanitizeText(point.counterNumber, 60),
      contactName: sanitizeText(point.contactName, 100),
      contactPhone: sanitizeText(point.contactPhone, 30),
      reportingInstructions: sanitizeText(point.reportingInstructions, 500),
      landmark: sanitizeText(point.landmark, 200),
      coordinates: validateCoordinates(point.coordinates),
    });
  }
  return sanitized;
}

function validateServedStopInput(items) {
  if (!Array.isArray(items) || items.length < 2) {
    throw fleetRouteError("FLEET_ROUTE_STOPS_REQUIRED", "Select at least two served stops.");
  }
  const ids = new Set();
  for (const item of items) {
    if (!item.stopId || ids.has(String(item.stopId))) {
      throw fleetRouteError("INVALID_FLEET_ROUTE_STOPS", "Served stops must be unique.");
    }
    ids.add(String(item.stopId));
    if (!USAGES.has(item.usage) || !BOARDING_MODES.has(item.boardingMode)) {
      throw fleetRouteError("INVALID_FLEET_ROUTE_STOP_BEHAVIOR", "Choose valid pickup and drop behaviour.");
    }
    if (item.boardingMode === "BOARDING_LOCATIONS" && !item.boardingLocationIds?.length && !item.customBoardingPoints?.length) {
      throw fleetRouteError("BOARDING_LOCATION_REQUIRED", "Choose at least one meeting place or counter.");
    }
    if (item.customBoardingPoints) {
      validateCustomBoardingPoints(item.customBoardingPoints);
    }
  }
  for (let index = 1; index < items.length; index += 1) {
    if (!Number.isInteger(items[index - 1].sequence)
      || items[index].sequence <= items[index - 1].sequence) {
      throw fleetRouteError(
        "INVALID_FLEET_ROUTE_STOP_ORDER",
        "Served stops must follow the selected road path."
      );
    }
  }
  if (!Number.isInteger(items[0].sequence)) {
    throw fleetRouteError("INVALID_FLEET_ROUTE_STOP_ORDER", "Served stops must follow the selected road path.");
  }
  if (items[0].usage === "DROP" || items.at(-1).usage === "PICKUP") {
    throw fleetRouteError(
      "INVALID_FLEET_ROUTE_ENDPOINT_BEHAVIOR",
      "The first stop must allow boarding and the last stop must allow dropping."
    );
  }
}

function validateEndpoints(data) {
  const hasCanonicalOrigin = mongoose.isValidObjectId(data.originStopId);
  const hasCustomOrigin = Boolean(data.customOrigin?.name?.trim());
  if (!hasCanonicalOrigin && !hasCustomOrigin) {
    throw fleetRouteError("ORIGIN_REQUIRED", "Choose where this bus starts.");
  }

  const hasCanonicalDestination = mongoose.isValidObjectId(data.destinationStopId);
  const hasCustomDestination = Boolean(data.customDestination?.name?.trim());
  if (!hasCanonicalDestination && !hasCustomDestination) {
    throw fleetRouteError("DESTINATION_REQUIRED", "Choose where this bus ends.");
  }

  if (hasCanonicalOrigin && hasCanonicalDestination && String(data.originStopId) === String(data.destinationStopId)) {
    throw fleetRouteError("INVALID_ROUTE_ENDPOINTS", "Origin and destination stops must be different.");
  }

  if (data.customOrigin) {
    validateCoordinates(data.customOrigin.coordinates);
  }
  if (data.customDestination) {
    validateCoordinates(data.customDestination.coordinates);
  }
}

module.exports = {
  validateServedStopInput,
  validateEndpoints,
  validateCoordinates,
  validateCustomBoardingPoints,
  sanitizeText,
};

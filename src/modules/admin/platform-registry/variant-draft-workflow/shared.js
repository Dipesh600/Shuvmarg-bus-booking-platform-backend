"use strict";

const mongoose = require("mongoose");
const { routeVariantError } = require("../route-variant-errors.js");

function assertObjectId(value, code, label) {
  if (!mongoose.isValidObjectId(value)) throw routeVariantError(code, `${label} is invalid.`);
}

function sameId(left, right) {
  return Boolean(left && right && String(left._id || left) === String(right._id || right));
}

function validateDirection(direction) {
  if (!["FORWARD", "RETURN"].includes(direction)) {
    throw routeVariantError("INVALID_VARIANT_DIRECTION", "Variant direction must be FORWARD or RETURN.");
  }
  return direction;
}

function hasValidCoordinates(coordinates) {
  return Number.isFinite(coordinates?.lat) && Number.isFinite(coordinates?.lng);
}

function mapProviderOptions(routes) {
  return routes.map((route, index) => ({
    providerRouteIndex: index,
    encodedPolyline: route.polyline,
    distanceMeters: Math.round(Number(route.distanceKm) * 1000),
    durationSeconds: Math.round(Number(route.durationMins) * 60),
    description: route.description || null,
    roadLabels: Array.isArray(route.roadLabels) ? route.roadLabels : [],
  }));
}

module.exports = { assertObjectId, hasValidCoordinates, mapProviderOptions, sameId, validateDirection };

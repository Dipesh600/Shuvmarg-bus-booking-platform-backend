"use strict";

const Stop = require("../../../../../models/stopModel.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { assertObjectId, hasValidCoordinates } = require("./shared.js");

const MAX_GUIDANCE_STOPS = 3;

async function resolveGuidanceStops(stopIds, endpoints, StopModel = Stop) {
  if (stopIds === undefined) return [];
  if (!Array.isArray(stopIds) || stopIds.length > MAX_GUIDANCE_STOPS) {
    throw routeVariantError("INVALID_ROUTE_GUIDANCE", "Choose no more than three places to guide this road path.");
  }
  const ids = [...new Set(stopIds.map(String))];
  ids.forEach((id) => assertObjectId(id, "INVALID_ROUTE_GUIDANCE", "Route guidance stop ID"));
  const endpointIds = [endpoints.origin, endpoints.destination].map((stop) => String(stop._id));
  if (ids.some((id) => endpointIds.includes(id))) {
    throw routeVariantError("INVALID_ROUTE_GUIDANCE", "Corridor endpoints cannot also be route guidance places.");
  }
  if (ids.length === 0) return [];
  const stops = await StopModel.find({ _id: { $in: ids } }).lean();
  const byId = new Map(stops.map((stop) => [String(stop._id), stop]));
  return ids.map((id) => {
    const stop = byId.get(id);
    if (!stop || stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" ||
        !hasValidCoordinates(stop.coordinates)) {
      throw routeVariantError(
        "INVALID_ROUTE_GUIDANCE",
        "Every route guidance place must be an active, verified registry place with map coordinates."
      );
    }
    return stop;
  });
}

module.exports = { MAX_GUIDANCE_STOPS, resolveGuidanceStops };

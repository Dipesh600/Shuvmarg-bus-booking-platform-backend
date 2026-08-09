"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { getVariantById } = require("./route-variant-registry.service.js");

function mappedStops(variantId, stops, stopMap) {
  return stops.map((stop) => ({
    variantId,
    stopId: stopMap[stop.stopCode.toUpperCase()],
    sequence: stop.sequence,
    isMajor: stop.isMajor !== undefined ? stop.isMajor : true,
    estimatedMinutesFromOrigin: stop.estimatedMinutesFromOrigin || 0,
  }));
}

async function setVariantStops(variantId, stops) {
  await getVariantById(variantId);
  const codes = stops.map((stop) => stop.stopCode.toUpperCase());
  const stopDocs = await Stop.find({ code: { $in: codes }, status: "ACTIVE" });
  if (stopDocs.length !== codes.length) {
    const found = stopDocs.map((stop) => stop.code);
    const missing = codes.filter((code) => !found.includes(code));
    throw new Error(`Stops not found in registry: ${missing.join(", ")}`);
  }
  const stopMap = Object.fromEntries(
    stopDocs.map((stop) => [stop.code, stop._id])
  );
  await RouteStop.deleteMany({ variantId });
  const result = await RouteStop.insertMany(
    mappedStops(variantId, stops, stopMap)
  );
  return result;
}

function getStopsForVariant(variantId) {
  return RouteStop.find({ variantId })
    .populate("stopId", "name code type state")
    .sort({ sequence: 1 })
    .lean();
}

module.exports = { setVariantStops, getStopsForVariant };

"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
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

function reversedStops(variantId, stops, stopMap) {
  const total = Math.max(
    ...stops.map((stop) => stop.estimatedMinutesFromOrigin || 0)
  );
  return [...stops].reverse().map((stop, index) => ({
    variantId,
    stopId: stopMap[stop.stopCode.toUpperCase()],
    sequence: index + 1,
    isMajor: stop.isMajor !== undefined ? stop.isMajor : true,
    estimatedMinutesFromOrigin: Math.max(
      0, total - (stop.estimatedMinutesFromOrigin || 0)
    ),
  }));
}

async function replaceLinkedSequence(variant, stops, stopMap) {
  if (variant.returnVariantId) {
    const linked = await RouteVariant.findById(variant.returnVariantId);
    if (!linked) return;
    await RouteStop.deleteMany({ variantId: linked._id });
    await RouteStop.insertMany(reversedStops(linked._id, stops, stopMap));
    return;
  }
  const forward = await RouteVariant.findOne({ returnVariantId: variant._id });
  if (!forward) return;
  await RouteStop.deleteMany({ variantId: forward._id });
  await RouteStop.insertMany(reversedStops(forward._id, stops, stopMap));
}

async function setVariantStops(variantId, stops) {
  const variant = await getVariantById(variantId);
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
  await replaceLinkedSequence(variant, stops, stopMap);
  return result;
}

function getStopsForVariant(variantId) {
  return RouteStop.find({ variantId })
    .populate("stopId", "name code type state")
    .sort({ sequence: 1 })
    .lean();
}

module.exports = { setVariantStops, getStopsForVariant };

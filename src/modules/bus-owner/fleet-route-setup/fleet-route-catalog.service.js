"use strict";

const Stop = require("../../../../models/stopModel.js");
const Corridor = require("../../../../models/routeCorridorModel.js");
const Variant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { loadEndpointScope } = require("./endpoint-scope.service.js");
const { mapStop, mapVariant } = require("./fleet-route-catalog.mapper.js");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchStops(query = "", purpose = "ENDPOINT") {
  const filter = {
    status: "ACTIVE", verificationStatus: "VERIFIED",
  };
  if (purpose === "ROUTE_STOP") filter.isRouteStop = true;
  else filter.isSearchable = true;
  if (query.trim()) {
    const term = new RegExp(escapeRegex(query.trim()), "i");
    filter.$or = [{ name: term }, { code: term }, { aliases: term }];
  }
  const stops = await Stop.find(filter)
    .select("name code parentStopId district municipality province coordinates isRouteStop")
    .populate("parentStopId", "name").sort({ popularityScore: -1, name: 1 }).limit(25).lean();
  return stops.map(mapStop);
}

function bestCorridor(corridors, originIds, destinationIds) {
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const corridor of corridors) {
    const originIndex = originIds.indexOf(String(corridor.originId));
    const destinationIndex = destinationIds.indexOf(String(corridor.destinationId));
    const reverseOriginIndex = originIds.indexOf(String(corridor.destinationId));
    const reverseDestinationIndex = destinationIds.indexOf(String(corridor.originId));
    const forward = originIndex >= 0 && destinationIndex >= 0;
    const reverse = reverseOriginIndex >= 0 && reverseDestinationIndex >= 0;
    const score = forward ? originIndex + destinationIndex
      : reverse ? reverseOriginIndex + reverseDestinationIndex : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      best = { corridor, direction: forward ? "FORWARD" : "RETURN" };
    }
  }
  return best;
}

async function listRouteOptions(originStopId, destinationStopId) {
  const mongoose = require("mongoose");
  if (!mongoose.isValidObjectId(originStopId) || !mongoose.isValidObjectId(destinationStopId)) {
    return { status: "NEEDS_PLATFORM_REVIEW", corridor: null, variants: [] };
  }
  const [originScope, destinationScope] = await Promise.all([
    loadEndpointScope(originStopId), loadEndpointScope(destinationStopId),
  ]);
  const originIds = originScope.map((stop) => String(stop._id));
  const destinationIds = destinationScope.map((stop) => String(stop._id));
  const corridors = await Corridor.find({
    status: "ACTIVE",
    $or: [
      { originId: { $in: originIds }, destinationId: { $in: destinationIds } },
      { originId: { $in: destinationIds }, destinationId: { $in: originIds } },
    ],
  }).lean();
  const match = bestCorridor(corridors, originIds, destinationIds);
  if (!match) {
    return { status: "NEEDS_PLATFORM_REVIEW", corridor: null, variants: [] };
  }
  const variants = await Variant.find({
    corridorId: match.corridor._id, direction: match.direction, status: "ACTIVE",
  }).sort({ name: 1 }).lean();
  const stopRows = await RouteStop.find({ variantId: { $in: variants.map((item) => item._id) } })
    .populate({
      path: "stopId",
      match: { status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true },
      select: "name code district municipality province coordinates isRouteStop",
    }).sort({ variantId: 1, sequence: 1 }).lean();
  const rowsByVariant = new Map();
  for (const row of stopRows) {
    if (!row.stopId) continue;
    const key = String(row.variantId);
    rowsByVariant.set(key, [...(rowsByVariant.get(key) || []), row]);
  }
  return {
    status: variants.length ? "AVAILABLE" : "NEEDS_PLATFORM_REVIEW",
    direction: match.direction,
    corridor: { id: String(match.corridor._id), code: match.corridor.code },
    variants: variants.map((item) => mapVariant(item, rowsByVariant.get(String(item._id)) || [])),
  };
}

module.exports = { searchStops, listRouteOptions, bestCorridor };

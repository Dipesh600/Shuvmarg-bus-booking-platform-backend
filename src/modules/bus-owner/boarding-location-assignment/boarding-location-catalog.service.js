"use strict";

const BoardingLocation = require("../../../../models/boardingLocationModel.js");
const Stop = require("../../../../models/stopModel.js");
const { resolveOperationalStop } = require(
  "../../admin/platform-registry/boarding-location/boarding-location-stop.policy.js"
);
const { mapBoardingLocation } = require(
  "../../admin/platform-registry/boarding-location/boarding-location.mapper.js"
);
const {
  assertOwnedActiveBrand, assertBrandServesStop, listBrandServedStopIds,
} = require("./brand-ownership.policy.js");

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listCanonicalBoardingLocations(ownerId, { brandId, stopId, q }) {
  const brand = await assertOwnedActiveBrand(ownerId, brandId);
  await assertBrandServesStop(brand._id, stopId);
  const stop = await resolveOperationalStop({ stopId });
  const query = {
    stopId: stop._id, status: "ACTIVE", verificationStatus: "VERIFIED",
  };
  if (q?.trim()) {
    const match = new RegExp(escapeRegex(q.trim()), "i");
    query.$or = [{ name: match }, { aliases: match }, { landmark: match }];
  }
  const locations = await BoardingLocation.find(query)
    .populate("stopId", "name code").sort({ name: 1 }).limit(100).lean();
  return locations.map(mapBoardingLocation);
}

async function listOperationalRouteStops(ownerId, { brandId, q }) {
  const brand = await assertOwnedActiveBrand(ownerId, brandId);
  const servedStopIds = await listBrandServedStopIds(brand._id);
  if (servedStopIds.length === 0) return [];
  const query = {
    _id: { $in: servedStopIds },
    status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
  };
  if (q?.trim()) {
    const match = new RegExp(escapeRegex(q.trim()), "i");
    query.$or = [{ name: match }, { code: match }, { aliases: match }];
  }
  const stops = await Stop.find(query)
    .select("name code district municipality coordinates")
    .sort({ name: 1 }).limit(100).lean();
  return stops.map((stop) => ({
    id: String(stop._id), name: stop.name, code: stop.code,
    district: stop.district || null, municipality: stop.municipality || null,
    coordinates: stop.coordinates || null,
  }));
}

module.exports = { listCanonicalBoardingLocations, listOperationalRouteStops };

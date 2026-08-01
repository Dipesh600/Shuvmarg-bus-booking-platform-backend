"use strict";

const BoardingLocation = require("../../../../../models/boardingLocationModel.js");
const Assignment = require("../../../../../models/operatorBoardingAssignmentModel.js");
const { boardingLocationError } = require("../../../../domain/boarding-location/boarding-location-errors.js");
const { resolveOperationalStop } = require("./boarding-location-stop.policy.js");
const { findNearbyBoardingLocations } = require("./boarding-location-nearby.service.js");
const { mapBoardingLocation } = require("./boarding-location.mapper.js");
const { assertBoardingLocationId } = require("./boarding-location-id.policy.js");
const { assertNoActiveBoardingAssignments } = require("./boarding-location-usage.policy.js");
const {
  assertNearbyReview, buildVerificationFields,
  mapBoardingLocationWriteError,
} = require("./boarding-location-write.policy.js");

async function createBoardingLocation(data, adminId) {
  const stop = await resolveOperationalStop(data);
  const nearby = await findNearbyBoardingLocations({
    stopId: stop._id, coordinates: data.coordinates,
  });
  assertNearbyReview(nearby, data.nearbyReview);
  const source = data.source || "ADMIN";
  const payload = {
    stopId: stop._id,
    name: data.name,
    aliases: data.aliases || [],
    landmark: data.landmark,
    address: data.address,
    locationType: data.locationType,
    gateOrBay: data.gateOrBay,
    directionHint: data.directionHint,
    coordinates: data.coordinates,
    coordinateSource: data.coordinateSource || "MAP_PIN",
    coordinateAccuracyMeters: data.coordinateAccuracyMeters,
    capturedAt: data.capturedAt,
    providerMetadata: data.providerMetadata,
    ...buildVerificationFields(data, adminId),
    nearbyReview: data.nearbyReview?.acknowledged ? {
      reason: data.nearbyReview.reason || "Reviewed nearby locations",
      reviewedBy: adminId || null,
      reviewedAt: new Date(),
    } : undefined,
    source,
    status: data.status || "ACTIVE",
    createdBy: adminId || null,
    createdByType: "ADMIN",
  };
  try {
    const location = await BoardingLocation.create(payload);
    await location.populate("stopId", "name code");
    return {
      location: mapBoardingLocation(location),
      nearbyWarnings: nearby.map(mapBoardingLocation),
    };
  } catch (error) {
    return mapBoardingLocationWriteError(error);
  }
}

async function listBoardingLocations(filter = {}) {
  const query = {};
  for (const key of ["stopId", "status", "verificationStatus", "source"]) {
    if (filter[key] !== undefined) query[key] = filter[key];
  }
  if (filter.stopCode) {
    const stop = await resolveOperationalStop({ stopCode: filter.stopCode });
    query.stopId = stop._id;
  }
  const locations = await BoardingLocation.find(query)
    .populate("stopId", "name code")
    .sort({ name: 1 })
    .lean();
  const counts = await Assignment.aggregate([
    { $match: { boardingLocationId: { $in: locations.map((item) => item._id) }, status: "ACTIVE" } },
    { $group: { _id: "$boardingLocationId", count: { $sum: 1 } } },
  ]);
  const byLocation = new Map(counts.map((item) => [String(item._id), item.count]));
  return locations.map((location) => mapBoardingLocation({
    ...location, activeAssignmentCount: byLocation.get(String(location._id)) || 0,
  }));
}

async function getBoardingLocation(id) {
  assertBoardingLocationId(id);
  const location = await BoardingLocation.findById(id)
    .populate("stopId", "name code")
    .lean();
  if (!location) {
    throw boardingLocationError(
      "BOARDING_LOCATION_NOT_FOUND", "Boarding location not found.", 404
    );
  }
  return mapBoardingLocation(location);
}

async function getNearbyLocations(data) {
  const stop = await resolveOperationalStop(data);
  const locations = await findNearbyBoardingLocations({
    stopId: stop._id,
    coordinates: data.coordinates,
    radiusMeters: data.radiusMeters,
    excludeId: data.excludeId,
  });
  return locations.map(mapBoardingLocation);
}

async function updateBoardingLocation(id, data, adminId) {
  assertBoardingLocationId(id);
  const location = await BoardingLocation.findById(id);
  if (!location) {
    throw boardingLocationError(
      "BOARDING_LOCATION_NOT_FOUND", "Boarding location not found.", 404
    );
  }
  if (data.status === "INACTIVE") {
    await assertNoActiveBoardingAssignments(location._id);
  }
  if (data.stopId || data.stopCode) {
    const stop = await resolveOperationalStop(data);
    location.stopId = stop._id;
  }
  for (const key of [
    "name", "aliases", "landmark", "address", "coordinates",
    "locationType", "gateOrBay", "directionHint", "coordinateSource",
    "coordinateAccuracyMeters", "capturedAt", "providerMetadata", "status",
  ]) {
    if (data[key] !== undefined) location[key] = data[key];
  }
  if (data.verificationStatus !== undefined) {
    Object.assign(location, buildVerificationFields(data, adminId));
  }
  try {
    await location.save();
    await location.populate("stopId", "name code");
    return mapBoardingLocation(location);
  } catch (error) {
    return mapBoardingLocationWriteError(error);
  }
}

async function deactivateBoardingLocation(id) {
  assertBoardingLocationId(id);
  const location = await BoardingLocation.findById(id);
  if (!location) {
    throw boardingLocationError(
      "BOARDING_LOCATION_NOT_FOUND", "Boarding location not found.", 404
    );
  }
  await assertNoActiveBoardingAssignments(location._id);
  location.status = "INACTIVE";
  await location.save();
  return mapBoardingLocation(location);
}

module.exports = { createBoardingLocation, listBoardingLocations,
  getBoardingLocation, updateBoardingLocation, deactivateBoardingLocation,
  getNearbyLocations };

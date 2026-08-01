"use strict";

const BoardingLocation = require(
  "../../../../../models/boardingLocationModel.js"
);
const {
  normalizeBoardingCoordinates,
} = require("../../../../domain/boarding-location/boarding-location-coordinates.js");

function distanceMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latDelta = radians(right.lat - left.lat);
  const lngDelta = radians(right.lng - left.lng);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) *
    Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearbyBoardingLocations({
  stopId, coordinates, radiusMeters = 100, excludeId,
}) {
  const normalized = normalizeBoardingCoordinates(coordinates);
  const maximum = Math.min(Math.max(Number(radiusMeters) || 100, 1), 1000);
  const query = {
    stopId,
    status: "ACTIVE",
  };
  if (excludeId) query._id = { $ne: excludeId };
  const locations = await BoardingLocation.find(query)
    .populate("stopId", "name code")
    .lean();
  return locations
    .map((location) => ({
      ...location,
      distanceMeters: Math.round(distanceMeters(normalized, location.coordinates)),
    }))
    .filter((location) => location.distanceMeters <= maximum)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, 10);
}

module.exports = { distanceMeters, findNearbyBoardingLocations };

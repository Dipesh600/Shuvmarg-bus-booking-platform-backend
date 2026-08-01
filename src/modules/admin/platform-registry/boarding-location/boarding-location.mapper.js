"use strict";

function idOf(value) {
  return value?._id || value?.id || value || null;
}

function mapStop(stop) {
  if (!stop || typeof stop !== "object") return null;
  return {
    id: String(idOf(stop)),
    code: stop.code || null,
    name: stop.name || null,
  };
}

function mapBoardingLocation(location) {
  const source = location?.toObject ? location.toObject() : location;
  return {
    id: String(idOf(source)),
    stopId: String(idOf(source.stopId)),
    stop: mapStop(source.stopId),
    name: source.name,
    aliases: source.aliases || [],
    landmark: source.landmark || null,
    address: source.address || null,
    coordinates: source.coordinates,
    distanceMeters: source.distanceMeters ?? null,
    verificationStatus: source.verificationStatus,
    source: source.source,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

module.exports = { mapBoardingLocation };

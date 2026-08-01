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
    locationType: source.locationType || "ROADSIDE",
    gateOrBay: source.gateOrBay || null,
    directionHint: source.directionHint || null,
    coordinates: source.coordinates,
    coordinateSource: source.coordinateSource || "MAP_PIN",
    coordinateAccuracyMeters: source.coordinateAccuracyMeters ?? null,
    capturedAt: source.capturedAt || null,
    providerMetadata: source.providerMetadata || null,
    distanceMeters: source.distanceMeters ?? null,
    verificationStatus: source.verificationStatus,
    verificationMethod: source.verificationMethod || null,
    verifiedBy: source.verifiedBy ? String(idOf(source.verifiedBy)) : null,
    verifiedAt: source.verifiedAt || null,
    verificationNotes: source.verificationNotes || null,
    source: source.source,
    status: source.status,
    activeAssignmentCount: source.activeAssignmentCount ?? 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

module.exports = { mapBoardingLocation };

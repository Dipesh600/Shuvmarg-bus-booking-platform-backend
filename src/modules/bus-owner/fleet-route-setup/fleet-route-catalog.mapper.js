"use strict";

function mapStop(stop) {
  return {
    id: String(stop._id), code: stop.code || null, name: stop.name,
    parentStop: stop.parentStopId && typeof stop.parentStopId === "object"
      ? { id: String(stop.parentStopId._id), name: stop.parentStopId.name }
      : null,
    district: stop.district || null, municipality: stop.municipality || null,
    province: stop.province || null, isRouteStop: Boolean(stop.isRouteStop),
    coordinates: stop.coordinates?.lat != null && stop.coordinates?.lng != null
      ? { lat: stop.coordinates.lat, lng: stop.coordinates.lng } : null,
  };
}

function mapVariant(variant, stops) {
  return {
    id: String(variant._id), code: variant.code, name: variant.name,
    direction: variant.direction, type: variant.type,
    distanceKm: variant.distanceKm, durationMinutes: variant.durationMinutes,
    returnVariantId: variant.returnVariantId ? String(variant.returnVariantId) : null,
    stops: stops.map((item) => ({
      ...mapStop(item.stopId), sequence: item.sequence,
      distanceFromOriginKm: item.distanceFromOriginKm,
      durationFromOriginMins: item.durationFromOriginMins,
      isMajor: Boolean(item.isMajor),
    })),
  };
}

module.exports = { mapStop, mapVariant };

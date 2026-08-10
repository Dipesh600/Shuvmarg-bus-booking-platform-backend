"use strict";

const { routeVariantError } = require("../route-variant-errors.js");

function metersBetween(left, right) {
  const radians = ((left.lat + right.lat) / 2) * Math.PI / 180;
  return Math.hypot(
    (right.lng - left.lng) * 111320 * Math.cos(radians),
    (right.lat - left.lat) * 110540
  );
}

function projectPointToSegment(point, start, end) {
  const radians = ((point.lat + start.lat + end.lat) / 3) * Math.PI / 180;
  const longitudeScale = 111320 * Math.cos(radians);
  const latitudeScale = 110540;
  const ax = start.lng * longitudeScale;
  const ay = start.lat * latitudeScale;
  const bx = end.lng * longitudeScale;
  const by = end.lat * latitudeScale;
  const px = point.lng * longitudeScale;
  const py = point.lat * latitudeScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((px - ax) * dx + (py - ay) * dy) / lengthSquared
  ));
  return {
    fraction,
    distanceMeters: Math.hypot(px - (ax + dx * fraction), py - (ay + dy * fraction)),
  };
}

function buildRouteMetric(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) {
    throw routeVariantError("INVALID_ROUTE_POLYLINE", "The selected road-route suggestion does not contain usable geometry.");
  }
  const points = polyline.map(([lng, lat]) => ({ lat, lng }));
  let distanceFromOriginMeters = 0;
  const segments = points.slice(1).map((end, index) => {
    const start = points[index];
    const lengthMeters = metersBetween(start, end);
    const segment = { start, end, lengthMeters, distanceFromOriginMeters };
    distanceFromOriginMeters += lengthMeters;
    return segment;
  });
  return { points, segments, lengthMeters: distanceFromOriginMeters };
}

function locateOnRoute(point, metric) {
  return metric.segments.reduce((closest, segment) => {
    const projection = projectPointToSegment(point, segment.start, segment.end);
    const candidate = {
      distanceToRouteMeters: projection.distanceMeters,
      distanceFromOriginMeters: segment.distanceFromOriginMeters + segment.lengthMeters * projection.fraction,
    };
    return !closest || candidate.distanceToRouteMeters < closest.distanceToRouteMeters ? candidate : closest;
  }, null);
}

function routeBoundingBox(points, marginMeters) {
  const latitudeMargin = marginMeters / 110540;
  const averageLatitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const longitudeMargin = marginMeters / (111320 * Math.cos(averageLatitude * Math.PI / 180));
  return {
    minLat: Math.min(...points.map((point) => point.lat)) - latitudeMargin,
    maxLat: Math.max(...points.map((point) => point.lat)) + latitudeMargin,
    minLng: Math.min(...points.map((point) => point.lng)) - longitudeMargin,
    maxLng: Math.max(...points.map((point) => point.lng)) + longitudeMargin,
  };
}

function toCoordinates(stop) { return { lat: Number(stop.coordinates?.lat), lng: Number(stop.coordinates?.lng) }; }
function stopAddress(stop) { return [stop.municipality, stop.district, stop.province].filter(Boolean).join(", ") || null; }

function routeTiming(location, option, metric) {
  const fraction = metric.lengthMeters > 0
    ? Math.max(0, Math.min(1, location.distanceFromOriginMeters / metric.lengthMeters)) : 0;
  return {
    distanceFromOriginMeters: Math.round((option.distanceMeters || 0) * fraction),
    durationFromOriginSeconds: Math.round((option.durationSeconds || 0) * fraction),
  };
}

module.exports = {
  buildRouteMetric, locateOnRoute, metersBetween, routeBoundingBox,
  routeTiming, stopAddress, toCoordinates,
};

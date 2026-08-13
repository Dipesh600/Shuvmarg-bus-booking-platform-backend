"use strict";

const EARTH_KM = 6371;
const rad = (value) => value * Math.PI / 180;
function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(value));
}
function projectOnSegment(point, start, end) {
  const scale = Math.cos(rad((start.lat + end.lat + point.lat) / 3));
  const ax = start.lng * scale; const ay = start.lat;
  const bx = end.lng * scale; const by = end.lat;
  const px = point.lng * scale; const py = point.lat;
  const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSquared)) : 0;
  return { ratio, point: { lat: start.lat + (end.lat - start.lat) * ratio, lng: start.lng + (end.lng - start.lng) * ratio } };
}
function locateOnRoute(point, path) {
  if (!point || !Array.isArray(path) || path.length < 2) return null;
  let travelledKm = 0; let best = null;
  for (let index = 1; index < path.length; index += 1) {
    const start = { lng: path[index - 1][0], lat: path[index - 1][1] };
    const end = { lng: path[index][0], lat: path[index][1] };
    const segmentKm = distanceKm(start, end);
    const projected = projectOnSegment(point, start, end);
    const offRouteKm = distanceKm(point, projected.point);
    const candidate = { distanceAlongKm: travelledKm + segmentKm * projected.ratio, offRouteKm };
    if (!best || candidate.offRouteKm < best.offRouteKm) best = candidate;
    travelledKm += segmentKm;
  }
  return { ...best, routeLengthKm: travelledKm };
}
module.exports = { distanceKm, locateOnRoute };

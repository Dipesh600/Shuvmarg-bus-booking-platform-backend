"use strict";

const ZONE_NEAR_KM = 40;
const ZONE_NEAR_INTERVAL = 0.3;
const ZONE_MID_INTERVAL = 2;

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Sample densely near both terminals and sparsely through the highway middle. */
function sampleZoneAware(coords, totalRouteKm, maxSamples = null) {
  if (!coords || coords.length === 0) return [];
  if (coords.length === 1) return [{ point: coords[0], km: 0 }];
  let routeLengthKm = 0;
  const segments = coords.slice(1).map((end, index) => {
    const start = coords[index];
    const lengthKm = haversineKm(start, end);
    const segment = { start, end, startKm: routeLengthKm, endKm: routeLengthKm + lengthKm, lengthKm };
    routeLengthKm += lengthKm;
    return segment;
  });
  const interpolate = (targetKm) => {
    const km = Math.max(0, Math.min(routeLengthKm, targetKm));
    const segment = segments.find((entry) => km <= entry.endKm) || segments.at(-1);
    const ratio = segment.lengthKm === 0 ? 0 : (km - segment.startKm) / segment.lengthKm;
    return [
      segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
      segment.start[1] + (segment.end[1] - segment.start[1]) * ratio,
    ];
  };
  const useZones = (totalRouteKm || routeLengthKm) > ZONE_NEAR_KM * 2 && routeLengthKm > ZONE_NEAR_KM * 2;
  const destinationZoneStart = routeLengthKm - ZONE_NEAR_KM;
  const fromTargets = (targets) => targets.map((km) => ({ point: interpolate(km), km }));
  const evenlySpaced = (startKm, endKm, count) => {
    if (count <= 0 || endKm < startKm) return [];
    if (count === 1) return [startKm];
    return Array.from({ length: count }, (_, index) =>
      startKm + (endKm - startKm) * index / (count - 1)
    );
  };
  const intervalAt = (km) => {
    if (!useZones || km <= ZONE_NEAR_KM || km >= destinationZoneStart) return ZONE_NEAR_INTERVAL;
    return ZONE_MID_INTERVAL;
  };
  const targets = [0];
  for (let km = intervalAt(0); km < routeLengthKm; km += intervalAt(km)) targets.push(km);
  targets.push(routeLengthKm);
  const samples = fromTargets(targets);
  if (!Number.isSafeInteger(maxSamples) || maxSamples <= 0 || samples.length <= maxSamples) return samples;
  if (maxSamples === 1) return [samples[0]];

  // A uniform cap erased the dense endpoint coverage promised above: on a
  // 200 km route, 48 uniformly retained samples are roughly four kilometres
  // apart everywhere. Reserve most of the provider-call budget for the first
  // and last 40 km, where passenger pickup/drop markets are most important.
  if (!useZones) return fromTargets(evenlySpaced(0, routeLengthKm, maxSamples));

  const originBudget = Math.max(1, Math.floor(maxSamples * 0.375));
  const destinationBudget = Math.max(1, Math.floor(maxSamples * 0.375));
  const middleBudget = Math.max(0, maxSamples - originBudget - destinationBudget);
  const selectedTargets = [
    ...evenlySpaced(0, ZONE_NEAR_KM, originBudget),
    ...evenlySpaced(ZONE_NEAR_KM, destinationZoneStart, middleBudget),
    ...evenlySpaced(destinationZoneStart, routeLengthKm, destinationBudget),
  ].filter((km, index, values) => index === 0 || Math.abs(km - values[index - 1]) > 0.001);
  return fromTargets(selectedTargets);
}

module.exports = {
  ZONE_MID_INTERVAL,
  ZONE_NEAR_INTERVAL,
  ZONE_NEAR_KM,
  sampleZoneAware,
};

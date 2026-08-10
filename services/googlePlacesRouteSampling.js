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
  const useZones = totalRouteKm > ZONE_NEAR_KM * 2;
  const destinationZoneStart = totalRouteKm - ZONE_NEAR_KM;
  const intervalAt = (km) => {
    if (!useZones || km <= ZONE_NEAR_KM || km >= destinationZoneStart) return ZONE_NEAR_INTERVAL;
    return ZONE_MID_INTERVAL;
  };
  const samples = [{ point: coords[0], km: 0 }];
  let cumulativeKm = 0;
  let lastSampleKm = 0;
  for (let index = 1; index < coords.length; index += 1) {
    cumulativeKm += haversineKm(coords[index - 1], coords[index]);
    if (cumulativeKm - lastSampleKm >= intervalAt(cumulativeKm)) {
      samples.push({ point: coords[index], km: cumulativeKm });
      lastSampleKm = cumulativeKm;
    }
  }
  const last = coords.at(-1);
  if (samples.at(-1).point !== last) samples.push({ point: last, km: cumulativeKm });
  if (!Number.isSafeInteger(maxSamples) || maxSamples <= 0 || samples.length <= maxSamples) return samples;
  if (maxSamples === 1) return [samples[0]];

  // A uniform cap erased the dense endpoint coverage promised above: on a
  // 200 km route, 48 uniformly retained samples are roughly four kilometres
  // apart everywhere. Reserve most of the provider-call budget for the first
  // and last 40 km, where passenger pickup/drop markets are most important.
  const evenlySelect = (values, count) => {
    if (values.length <= count) return values;
    if (count <= 1) return [values[0]];
    return Array.from({ length: count }, (_, index) => (
      values[Math.round(index * (values.length - 1) / (count - 1))]
    ));
  };
  if (!useZones) return evenlySelect(samples, maxSamples);

  const origin = samples.filter((sample) => sample.km <= ZONE_NEAR_KM);
  const destination = samples.filter((sample) => sample.km >= destinationZoneStart);
  const middle = samples.filter((sample) => sample.km > ZONE_NEAR_KM && sample.km < destinationZoneStart);
  const originBudget = Math.max(1, Math.floor(maxSamples * 0.375));
  const destinationBudget = Math.max(1, Math.floor(maxSamples * 0.375));
  const middleBudget = Math.max(0, maxSamples - originBudget - destinationBudget);
  return [
    ...evenlySelect(origin, originBudget),
    ...evenlySelect(middle, middleBudget),
    ...evenlySelect(destination, destinationBudget),
  ].filter((sample, index, values) => index === 0 || sample !== values[index - 1]);
}

module.exports = {
  ZONE_MID_INTERVAL,
  ZONE_NEAR_INTERVAL,
  ZONE_NEAR_KM,
  sampleZoneAware,
};

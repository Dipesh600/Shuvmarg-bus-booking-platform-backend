"use strict";

function interpolate(stops, field, increment, fallback, precision = 0) {
  const last = stops.at(-1);
  if (last[field] == null) {
    const maximum = stops.reduce((max, stop) => Math.max(max, stop[field] || 0), 0);
    last[field] = maximum > 0 ? maximum + increment : (stops.length - 1) * fallback;
  }
  let anchor = 0;
  while (anchor < stops.length - 1) {
    let next = stops.length - 1;
    for (let index = anchor + 1; index < stops.length - 1; index += 1) {
      const value = stops[index][field];
      if (value != null && value >= stops[anchor][field] && value <= last[field]) {
        next = index;
        break;
      }
    }
    const start = stops[anchor][field];
    const end = stops[next][field];
    for (let index = anchor + 1; index < next; index += 1) {
      const value = start + ((index - anchor) / (next - anchor)) * (end - start);
      stops[index][field] = precision ? Math.round(value * precision) / precision : Math.round(value);
    }
    anchor = next;
  }
}

function interpolateMissingTimings(stops) {
  if (stops.length < 2) return;
  if (stops[0].durationFromOriginMins == null) stops[0].durationFromOriginMins = 0;
  if (stops[0].distanceFromOriginKm == null) stops[0].distanceFromOriginKm = 0;
  interpolate(stops, "durationFromOriginMins", 15, 30);
  if (stops.some((stop) => stop.distanceFromOriginKm != null)) {
    interpolate(stops, "distanceFromOriginKm", 10, 20, 10);
  }
}

module.exports = { interpolateMissingTimings };

'use strict';
const axios = require('axios');
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 5000;
const MAX_GEOCODES = 25;
const MAX_DURATION_MS = 15_000;
async function annotateAddresses(points, step) {
  if (!Array.isArray(points) || !points.length) return points;
  const stride = Math.max(1, Math.floor(Number(step)) || 20, Math.ceil((points.length - 1) / (MAX_GEOCODES - 1)));
  const indices = new Set([0, points.length - 1]);
  for (let i = stride; i < points.length - 1; i += stride) indices.add(i);
  const deadline = Date.now() + MAX_DURATION_MS;
  for (const index of indices) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const { lat, lng } = points[index];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const key = `${lat},${lng}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      points[index] = { ...points[index], address: cached.address };
      continue;
    }
    cache.delete(key);
    try {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { latlng: `${lat},${lng}`, key: process.env.GOOGLE_MAPS_API_KEY },
        timeout: Math.min(3000, remaining), maxRedirects: 0, maxContentLength: 1024 * 1024,
      });
      const address = data?.results?.[0]?.formatted_address || null;
      if (address) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(key, { address, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      points[index] = { ...points[index], address };
    } catch { /* An unavailable address does not invalidate the route geometry. */ }
  }
  return points;
}
module.exports = { annotateAddresses, MAX_GEOCODES, MAX_DURATION_MS };

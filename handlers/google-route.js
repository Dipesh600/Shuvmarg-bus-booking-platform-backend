const axios = require("axios");
const Route = require("../models/googleRouteModel.js");

function decodePolyline(encoded) {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coordinates;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddress(lat, lng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const { data } = await axios.get(url);
  const first = data?.results?.[0];
  return first ? first.formatted_address : null;
}

async function annotateAddresses(points, step) {
  if (!Array.isArray(points) || points.length === 0) return points;
  const n = points.length;
  const safeStep = Math.max(1, Math.min(Number(step) || 20, 100));

  const indices = new Set();
  indices.add(0);
  indices.add(n - 1);
  for (let i = safeStep; i < n - 1; i += safeStep) indices.add(i);

  for (const idx of Array.from(indices).sort((a, b) => a - b)) {
    try {
      const addr = await geocodeAddress(points[idx].lat, points[idx].lng);
      points[idx] = { ...points[idx], address: addr };
      await sleep(100);
    } catch (_) {}
  }
  return points;
}

async function buildAndStoreRoute({ origin, destination, name, addressStep = 1, createdBy }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    const err = new Error("Missing GOOGLE_MAPS_API_KEY in environment");
    err.statusCode = 400;
    throw err;
  }
  if (!origin || !destination) {
    const err = new Error("origin and destination are required");
    err.statusCode = 400;
    throw err;
  }

  const url = "https://maps.googleapis.com/maps/api/directions/json";
  const { data } = await axios.get(url, {
    params: { origin, destination, mode: "driving", key: apiKey },
  });

  if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
    const err = new Error(`Google Directions failed: ${data.status || "NO_ROUTES"}`);
    err.details = data.error_message || undefined;
    err.statusCode = 502;
    err.googlePayload = data;
    throw err;
  }

  const route0 = data.routes[0];
  const encoded = route0.overview_polyline && route0.overview_polyline.points;
  if (!encoded) {
    const err = new Error("No overview polyline returned by Google");
    err.statusCode = 502;
    throw err;
  }

  let points = decodePolyline(encoded);
  points = await annotateAddresses(points, addressStep);

  const routeName = name || `${origin} → ${destination}`;
  const doc = await Route.create({
    name: routeName,
    polyline: points,
    ...(createdBy ? { createdBy } : {}),
  });

  return doc;
}

module.exports = { buildAndStoreRoute };

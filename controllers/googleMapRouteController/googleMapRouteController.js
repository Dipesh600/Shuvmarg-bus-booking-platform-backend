const axios = require("axios");
const Route = require("../../models/googleRouteModel.js");
const { buildAndStoreRoute } = require("../../handlers/google-route.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function annotateAddresses(points, step) {
  if (!Array.isArray(points) || points.length === 0) return points;
  const n = points.length;
  const safeStep = Math.max(1, Math.min(Number(step) || 20, 100));

  const indices = new Set();
  // Always include first and last
  indices.add(0);
  indices.add(n - 1);
  for (let i = safeStep; i < n - 1; i += safeStep) indices.add(i);

  // Geocode sequentially to avoid hitting rate limits
  for (const idx of Array.from(indices).sort((a, b) => a - b)) {
    try {
      const addr = await geocodeAddress(points[idx].lat, points[idx].lng);
      points[idx] = { ...points[idx], address: addr };
      // Small delay between calls (adjust as needed)
      await sleep(100);
    } catch (_) {
      // continue on failure
    }
  }
  return points;
}

// Reverse geocode lat/lng to formatted address
async function geocodeAddress(lat, lng) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const { data } = await axios.get(url);
  const first = data?.results?.[0];
  return first ? first.formatted_address : null;
}

const storeKathmanduToBiratnagar = async (req, res, next) => {
  try {
    const createdBy = req.userInfo?.id;
    const doc = await buildAndStoreRoute({
      origin: "Kathmandu, Nepal",
      destination: "Biratnagar, Nepal",
      name: "Kathmandu → Biratnagar",
      addressStep: req.body?.addressStep || req.query?.addressStep || 1,
      createdBy,
    });
    return res.json({ status: true, message: "Route stored", route: doc });
  } catch (err) {
    const details = err.details || err?.response?.data?.error?.message || err.message;
    const status = err.statusCode || err?.response?.status || 500;
    const payload = err.googlePayload || err?.response?.data || undefined;
    return res.status(502).json({
      status: false,
      message: "Google request failed",
      details,
      googleStatus: status,
      googlePayload: payload,
    });
  }
}

const storeRouteByPlaces = async (req, res, next) => {
  try {
    const { origin: originBody, destination: destinationBody, name: nameBody } = req.body || {};
    const { origin: originQuery, destination: destinationQuery, name: nameQuery } = req.query || {};

    const origin = originBody || originQuery || "Kathmandu, Nepal";
    const destination = destinationBody || destinationQuery || "Biratnagar, Nepal";
    const name = nameBody || nameQuery || null;

    const createdBy = req.userInfo?.id || req.user?._id || req.body?.userId || req.query?.userId || null;

    const doc = await buildAndStoreRoute({
      origin,
      destination,
      name,
      addressStep: req.body?.addressStep || req.query?.addressStep || 1,
      createdBy,
    });

    return res.json({ status: true, message: "Route stored", route: doc });
  } catch (err) {
    const details = err.details || err?.response?.data?.error_message || err?.response?.data?.error?.message || err.message;
    const status = err.statusCode || err?.response?.status || 500;
    const payload = err.googlePayload || err?.response?.data || undefined;

    return res.status(502).json({
      status: false,
      message: "Google Directions API request failed",
      details,
      googleStatus: status,
      googlePayload: payload,
    });
  }
}

const decodeRouteAddresses = async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        status: false,
        message: "Missing GOOGLE_MAPS_API_KEY in environment",
      });
    }

    const name = req.query?.name;
    const step = req.body?.addressStep || req.query?.addressStep || 1; 
    if (!name) {
      return res.status(400).json({ status: false, message: "name is required (query)" });
    }

    const route = await Route.findOne({ name });
    if (!route) {
      return res.status(404).json({ status: false, message: "Route not found" });
    }

    const src = Array.isArray(route.polyline) ? route.polyline : [];
    // Normalize to {lat,lng}
    const points = src.map((p) => ({ lat: p.lat, lng: p.lng }));
    const annotated = await annotateAddresses(points, step);

    return res.json({
      status: true,
      message: "Addresses decoded",
      route: { name: route.name, polyline: annotated },
    });
  } catch (err) {
    const details = err?.response?.data?.error_message || err?.response?.data?.error?.message || err.message;
    const status = err?.response?.status || 500;
    const payload = err?.response?.data || undefined;
    return res.status(502).json({
      status: false,
      message: "Reverse geocoding failed",
      details,
      googleStatus: status,
      googlePayload: payload,
    });
  }
}

module.exports = { storeKathmanduToBiratnagar, storeRouteByPlaces, decodeRouteAddresses };
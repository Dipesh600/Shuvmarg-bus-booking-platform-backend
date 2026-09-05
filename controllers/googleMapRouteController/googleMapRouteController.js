const Route = require("../../models/googleRouteModel.js");
const { buildAndStoreRoute } = require("../../handlers/google-route.js");

const { annotateAddresses } = require('../../src/shared/maps/bounded-geocoding');

const storeKathmanduToBiratnagar = async (req, res, next) => {
  try {
    const createdBy = req.adminInfo?.id;
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

    const createdBy = req.adminInfo?.id || null;

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
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
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
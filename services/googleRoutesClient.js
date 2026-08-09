"use strict";

const axios = require("axios");
const { decodePolyline } = require("../src/modules/admin/route-discovery/polyline.js");

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.routeLabels",
].join(",");

function validCoordinates({ lat, lng } = {}) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function routeName(route, index) {
  if (route.routeLabels?.includes("DEFAULT_ROUTE_ALTERNATE")) {
    return `Alternative route ${index}`;
  }
  return "Recommended route";
}

function durationMinutes(duration = "0s") {
  return Math.round(Number.parseFloat(duration) / 60);
}

async function fetchGoogleRouteOptions(origin, destination) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  if (!validCoordinates(origin) || !validCoordinates(destination)) {
    throw new Error("Both corridor endpoints need valid map coordinates before discovering routes.");
  }
  const { data } = await axios.post(ROUTES_URL, {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    computeAlternativeRoutes: true,
    languageCode: "en",
    regionCode: "NP",
    polylineQuality: "HIGH_QUALITY",
  }, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
    timeout: 15_000,
  });
  if (!Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error("Google found no drivable route between the selected corridor endpoints.");
  }
  return data.routes.map((route, index) => {
    const polyline = route.polyline?.encodedPolyline;
    const coordinates = polyline ? decodePolyline(polyline) : [];
    if (coordinates.length < 2) throw new Error("Google returned a route without usable geometry.");
    return {
      provider: "GOOGLE",
      providerRouteId: `google-routes-${index}-${Date.now()}`,
      polyline,
      geometry: { type: "LineString", coordinates },
      distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
      durationMins: durationMinutes(route.duration),
      summary: routeName(route, index + 1),
    };
  });
}

module.exports = { fetchGoogleRouteOptions };

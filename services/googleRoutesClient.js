"use strict";

const axios = require("axios");
const {
  decodePolyline,
} = require("../src/modules/admin/platform-registry/route-geometry/polyline.js");

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.routeLabels",
  "routes.description",
  "routes.legs.steps.navigationInstruction.instructions",
].join(",");

function validCoordinates({ lat, lng } = {}) {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function cleanRoadLabel(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/^(?:head|continue|turn|keep|take|merge|exit)\s+(?:north|south|east|west|left|right)?\s*(?:onto|on|toward)?\s*/i, "")
    .replace(/\s+/g, " ").trim();
}

function routeRoadLabels(route) {
  const values = [
    route.description,
    ...(route.legs || []).flatMap((leg) => (leg.steps || [])
      .map((step) => step.navigationInstruction?.instructions)),
  ].map(cleanRoadLabel).filter((value) => value && value.length <= 90);
  return [...new Set(values.map((value) => value.toLocaleLowerCase()))]
    .map((normalized) => values.find((value) => value.toLocaleLowerCase() === normalized))
    .slice(0, 6);
}

function durationMinutes(duration = "0s") {
  return Math.round(Number.parseFloat(duration) / 60);
}

function waypoint(location, via = false) {
  return {
    ...(location.placeId
      ? { placeId: location.placeId }
      : { location: { latLng: { latitude: location.lat, longitude: location.lng } } }),
    ...(via && { via: true }),
  };
}

async function fetchGoogleRouteOptions(origin, destination, { via = [] } = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  if (!validCoordinates(origin) || !validCoordinates(destination)) {
    throw new Error("Both corridor endpoints need valid map coordinates before discovering routes.");
  }
  if (!Array.isArray(via) || via.length > 3 ||
      via.some((entry) => !validCoordinates(entry) && !entry?.placeId)) {
    throw new Error("Route guidance requires no more than three valid map positions.");
  }
  const { data } = await axios.post(ROUTES_URL, {
    origin: waypoint(origin),
    destination: waypoint(destination),
    ...(via.length && { intermediates: via.map((entry) => waypoint(entry, true)) }),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    // Google alternatives cannot be requested with intermediate waypoints.
    computeAlternativeRoutes: via.length === 0,
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
      description: typeof route.description === "string" ? route.description.trim() : null,
      roadLabels: routeRoadLabels(route),
      isRecommended: index === 0,
    };
  });
}

module.exports = { fetchGoogleRouteOptions, routeRoadLabels };

/**
 * services/mapboxClient.js
 *
 * Mapbox Directions API client for Route Discovery (Phase 2).
 *
 * What it does:
 *   Given two lat/lng points (origin stop → destination stop), fetches up to 3
 *   alternative road routes from the Mapbox Directions API and normalises them
 *   into the shape expected by RouteDiscovery.routeOptions[].
 *
 * ENV required:
 *   MAPBOX_SECRET_TOKEN   — your Mapbox secret token (sk.*)
 *
 * Called by:
 *   routeDiscoveryService.createDiscoverySession()  (auto-triggered after session creation)
 *   PATCH /registry/discovery/:id/route-options     (manual re-fetch)
 */

const axios = require("axios");

const MAPBOX_BASE = "https://api.mapbox.com/directions/v5/mapbox";
const PROFILE = "driving";           // driving | driving-traffic | walking | cycling
const MAX_ALTERNATIVES = 2;          // 0 = only 1 route, 2 = up to 3 total

// ── Internal: call the Directions API ────────────────────────────────────────

const _callDirectionsAPI = async (originCoords, destinationCoords) => {
    const token = process.env.MAPBOX_SECRET_TOKEN;

    if (!token || token === "your_mapbox_token_here") {
        throw new Error("MAPBOX_SECRET_TOKEN is not set. Add it to your .env file.");
    }

    // Mapbox expects: longitude,latitude (note: lon first)
    const originLng  = originCoords.lng  || originCoords.longitude  || originCoords[0];
    const originLat  = originCoords.lat  || originCoords.latitude   || originCoords[1];
    const destLng    = destinationCoords.lng  || destinationCoords.longitude  || destinationCoords[0];
    const destLat    = destinationCoords.lat  || destinationCoords.latitude   || destinationCoords[1];

    if (!originLng || !originLat || !destLng || !destLat) {
        throw new Error("Both origin and destination stops must have coordinates (lat/lng) to fetch routes.");
    }

    const coordinates = `${originLng},${originLat};${destLng},${destLat}`;
    const url = `${MAPBOX_BASE}/${PROFILE}/${coordinates}`;

    const response = await axios.get(url, {
        params: {
            access_token:  token,
            alternatives:  true,             // request alternate routes
            geometries:    "geojson",        // polyline as GeoJSON LineString
            overview:      "full",           // full resolution geometry
            steps:         false,            // we don't need turn-by-turn
            annotations:   "distance,duration",
        },
        timeout: 10_000,                     // 10 second hard timeout
    });

    return response.data;
};

// ── Normalise Mapbox response into RouteDiscovery routeOption shape ───────────

const _normaliseRoute = (route, index) => {
    const distanceKm     = Math.round((route.distance / 1000) * 10) / 10;       // metres → km, 1dp
    const durationMins   = Math.round(route.duration / 60);                      // seconds → minutes

    // Mapbox returns a GeoJSON geometry: { type: "LineString", coordinates: [[lng,lat], ...] }
    const geometry = route.geometry;

    return {
        providerRouteId:    `mapbox-${index}`,
        summary:            route.legs?.[0]?.summary || `Route option ${index + 1}`,
        distanceKm,
        durationMins,
        geometry,                   // stored as-is — used by admin UI map renderer
        polylineEncoded:    null,   // Mapbox returns GeoJSON, not encoded polyline
        provider:           "MAPBOX",
        rawResponse:        null,   // don't store the full raw — too large
    };
};

// ── Public: fetch route options for a discovery session ───────────────────────

/**
 * Fetches up to 3 route options from Mapbox for a given O-D pair.
 *
 * @param {Object} originCoords      — { lat, lng } or { latitude, longitude }
 * @param {Object} destinationCoords — { lat, lng } or { latitude, longitude }
 * @returns {Array}  Array of normalised routeOption objects (1–3 items)
 */
const fetchRouteOptions = async (originCoords, destinationCoords) => {
    let data;

    try {
        data = await _callDirectionsAPI(originCoords, destinationCoords);
    } catch (err) {
        if (err.response) {
            // Mapbox returned an error response
            const msg = err.response.data?.message || err.response.statusText;
            const code = err.response.status;
            throw new Error(`Mapbox API error (${code}): ${msg}`);
        }
        if (err.code === "ECONNABORTED") {
            throw new Error("Mapbox API timed out. Check your internet connection.");
        }
        throw err;  // re-throw unknown errors
    }

    if (!data.routes || data.routes.length === 0) {
        throw new Error(
            `Mapbox found no drivable route between the selected stops. ` +
            `Ensure both stops have valid coordinates and are reachable by road.`
        );
    }

    // Limit to MAX_ALTERNATIVES + 1 routes (default: 3)
    const routes = data.routes.slice(0, MAX_ALTERNATIVES + 1);
    return routes.map((r, i) => _normaliseRoute(r, i));
};

// ── Public: geocode a stop name via Mapbox Geocoding API ────────────────────

/**
 * Geocodes a place name using the Mapbox Geocoding API.
 * Used as a fallback when a stop has no lat/lng stored.
 *
 * @param {string} name  — stop name, e.g. "Kathmandu" or "Malangwa"
 * @param {string} [country="NP"] — ISO country code to bias results
 * @returns {{ lat: number, lng: number }}  or throws
 */
const geocodeStopName = async (name, country = "NP") => {
    const token = process.env.MAPBOX_SECRET_TOKEN;
    if (!token || token === "your_mapbox_secret_token_here") {
        throw new Error("MAPBOX_SECRET_TOKEN is not set.");
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json`;
    const response = await axios.get(url, {
        params: {
            access_token: token,
            country,
            limit: 1,
            types: "place,locality,district",
        },
        timeout: 8_000,
    });

    const features = response.data?.features;
    if (!features || features.length === 0) {
        throw new Error(`Mapbox could not geocode stop name: "${name}". Add manual coordinates to this stop.`);
    }

    const [lng, lat] = features[0].geometry.coordinates;
    return { lat, lng };
};


/**
 * Pulls lat/lng out of a Stop document's coordinates field.
 * Supports both { lat, lng } and GeoJSON { type: "Point", coordinates: [lng, lat] } shapes.
 */
const extractStopCoordinates = (stop) => {
    const coords = stop.coordinates;
    if (!coords) return null;

    // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
    if (coords.type === "Point" && Array.isArray(coords.coordinates)) {
        return { lng: coords.coordinates[0], lat: coords.coordinates[1] };
    }

    // Plain object: { lat, lng } or { latitude, longitude }
    if (coords.lat || coords.latitude) {
        return {
            lat: coords.lat || coords.latitude,
            lng: coords.lng || coords.longitude,
        };
    }

    return null;
};

module.exports = {
    fetchRouteOptions,
    extractStopCoordinates,
    geocodeStopName,
};

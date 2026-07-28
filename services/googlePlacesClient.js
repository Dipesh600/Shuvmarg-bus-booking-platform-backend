/**
 * services/googlePlacesClient.js
 *
 * Discovers towns, villages and cities along a bus route using
 * DENSE REVERSE GEOCODING — not keyword/bus-station searches.
 *
 * How it works:
 *   1. Receive the route polyline (GeoJSON LineString, decoded from Google's
 *      encoded polyline that the admin selected on the frontend map).
 *   2. Sample every SAMPLE_INTERVAL_KM km along the polyline.
 *   3. Reverse-geocode each point → Google returns the administrative locality
 *      the point is in (city, town, village, ward name, etc).
 *   4. Track when the locality name changes between consecutive samples.
 *      Only emit a new stop when the name changes.
 *   5. Deduplicate any name that appears twice (some localities are long).
 *   6. Return an ordered list matching the bus travel direction.
 *
 * This approach is correct because:
 *   - Google knows every named settlement in Nepal.
 *   - Reverse geocoding a point on the Malangwa–Kathmandu highway that is
 *     physically inside Gamhariya returns "Gamhariya" — exactly right.
 *   - No need to search for "bus park" or "yatayat" — those are wrong targets.
 *
 * API cost: ~$1.25 per 250km route (250 geocode calls × $0.005).
 *
 * Required ENV:
 *   GOOGLE_MAPS_API_KEY  — key with Geocoding API enabled
 */

const axios = require("axios");

const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

// ── Tuning ────────────────────────────────────────────────────────────────────

// Zone-aware sampling intervals (km).
// Buses pick up passengers densely near origin and destination.
// The middle stretch is mostly highway — 2km gaps are sufficient.
const ZONE_NEAR_KM       = 40;    // first / last N km → dense sampling
const ZONE_NEAR_INTERVAL = 0.3;   // 300 m — catches small villages
const ZONE_MID_INTERVAL  = 2.0;   // 2 km  — highway / main road

// Pause between reverse-geocode calls (ms).
// Geocoding API allows 50 QPS; 25ms gives safe 40 QPS.
const CALL_DELAY_MS = 25;

// Administrative types to look for, in priority order.
// Google returns the smallest known unit first in result_type results.
const LOCALITY_TYPES_PRIORITY = [
    "locality",                    // city / town / large village
    "sublocality_level_1",         // ward / district within a city
    "administrative_area_level_3", // municipality / rural municipality (Nepal)
    "sublocality",                 // generic sublocality
    "administrative_area_level_4", // smaller unit
    "neighborhood",                // neighbourhood
];

// ── Geometry helpers ──────────────────────────────────────────────────────────

const _haversineKm = ([lng1, lat1], [lng2, lat2]) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Zone-aware sampler — uses different intervals for origin-zone, middle, and
 * destination-zone so that dense village coverage is applied where buses
 * actually pick up / drop off passengers.
 *
 * Zones (based on cumulative distance from origin):
 *   [0, ZONE_NEAR_KM]                → ZONE_NEAR_INTERVAL (dense)
 *   [ZONE_NEAR_KM, total-ZONE_NEAR_KM] → ZONE_MID_INTERVAL  (sparse)
 *   [total-ZONE_NEAR_KM, total]       → ZONE_NEAR_INTERVAL (dense)
 *
 * For short routes (≤ 2×ZONE_NEAR_KM) the dense interval is used throughout.
 *
 * Returns [{ point: [lng, lat], km: <cumulative km from start> }, ...]
 */
const _sampleZoneAware = (coords, totalRouteKm) => {
    if (!coords || coords.length === 0) return [];
    if (coords.length === 1)           return [{ point: coords[0], km: 0 }];

    // For very short routes just use dense sampling end-to-end
    const useZones = totalRouteKm > ZONE_NEAR_KM * 2;
    const destZoneStart = totalRouteKm - ZONE_NEAR_KM;

    const _intervalAt = (km) => {
        if (!useZones) return ZONE_NEAR_INTERVAL;
        if (km <= ZONE_NEAR_KM)    return ZONE_NEAR_INTERVAL; // origin zone
        if (km >= destZoneStart)   return ZONE_NEAR_INTERVAL; // destination zone
        return ZONE_MID_INTERVAL;                             // middle highway
    };

    const samples = [{ point: coords[0], km: 0 }];
    let cumulativeKm = 0;
    let lastSampleKm = 0;

    for (let i = 1; i < coords.length; i++) {
        cumulativeKm += _haversineKm(coords[i - 1], coords[i]);
        const interval = _intervalAt(cumulativeKm);
        if (cumulativeKm - lastSampleKm >= interval) {
            samples.push({ point: coords[i], km: cumulativeKm });
            lastSampleKm = cumulativeKm;
        }
    }

    const last = coords[coords.length - 1];
    if (samples[samples.length - 1].point !== last) {
        samples.push({ point: last, km: cumulativeKm });
    }

    return samples;
};

// ── Reverse geocode ───────────────────────────────────────────────────────────

/**
 * Reverse geocode one point. Returns the most specific named locality or null.
 */
const _reverseGeocode = async (lat, lng, token) => {
    const { data } = await axios.get(GEOCODE_BASE, {
        params: {
            latlng: `${lat},${lng}`,
            key:    token,
            // Ask for only administrative / locality results to reduce noise
            result_type: LOCALITY_TYPES_PRIORITY.join("|"),
            language: "en",
        },
        timeout: 8_000,
    });

    if (data.status === "REQUEST_DENIED") {
        throw new Error(
            `Google Geocoding API denied: ${data.error_message || "Unknown error"}. ` +
            "Enable the Geocoding API in your Google Cloud project."
        );
    }
    if (data.status === "OVER_QUERY_LIMIT") {
        throw new Error("Google Geocoding API quota exceeded. Check billing.");
    }

    if (!data.results || data.results.length === 0) return null;

    // Parse address_components to find the most specific locality name
    for (const result of data.results) {
        const components = result.address_components || [];
        for (const type of LOCALITY_TYPES_PRIORITY) {
            const comp = components.find(c => c.types.includes(type));
            if (comp) {
                return {
                    name: comp.long_name,
                    type,
                };
            }
        }
    }

    return null;
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Discover all towns / villages / cities along a route polyline using
 * dense reverse geocoding.
 *
 * @param {Object} geometry          GeoJSON LineString
 * @param {number} totalDistanceKm
 * @param {number} totalDurationMins
 * @param {string} originName        For logging only
 * @param {string} destinationName   For logging only
 * @returns {Array} Ordered discoveredStop candidates
 */
const discoverStopsAlongRoute = async (
    geometry,
    totalDistanceKm = 0,
    totalDurationMins = 0,
    originName = "",
    destinationName = "",
) => {
    const token = process.env.GOOGLE_MAPS_API_KEY;

    if (!token || token === "your_google_maps_api_key_here") {
        throw new Error("GOOGLE_MAPS_API_KEY is not set. Add it to your .env file.");
    }
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
        throw new Error("geometry must be a valid GeoJSON LineString.");
    }

    const coords  = geometry.coordinates; // [[lng, lat], ...]
    const samples = _sampleZoneAware(coords, totalDistanceKm || 0);

    // Describe the zone config for the log
    const useZones = (totalDistanceKm || 0) > ZONE_NEAR_KM * 2;
    const zoneDesc = useZones
        ? `dense ${ZONE_NEAR_INTERVAL * 1000}m for first/last ${ZONE_NEAR_KM}km, ${ZONE_MID_INTERVAL}km in middle`
        : `dense ${ZONE_NEAR_INTERVAL * 1000}m throughout (short route)`;

    console.log(
        `[Geocode] ${originName || "?"} → ${destinationName || "?"}: ` +
        `${samples.length} sample points (${zoneDesc}) along ` +
        `${Math.round(totalDistanceKm)}km route.`
    );

    // ── Reverse-geocode each sample point ──────────────────────────────────
    const localities = []; // { name, km, lat, lng }
    let lastLocalityName = null;

    for (const { point: [lng, lat], km } of samples) {
        try {
            const result = await _reverseGeocode(lat, lng, token);

            if (!result) {
                // No named place at this point (e.g. open highway) — skip
                continue;
            }

            // Only emit a new stop when the locality name changes
            if (result.name !== lastLocalityName) {
                localities.push({ name: result.name, km, lat, lng });
                lastLocalityName = result.name;
            }

        } catch (err) {
            // Rethrow fatal errors
            if (err.message.includes("denied") || err.message.includes("quota")) throw err;
            // Transient errors — skip this point silently
        }

        // Throttle to avoid bursting the QPS limit
        await new Promise(r => setTimeout(r, CALL_DELAY_MS));
    }

    console.log(
        `[Geocode] Found ${localities.length} distinct localities ` +
        `(${samples.length} points sampled).`
    );

    if (localities.length === 0) return [];

    // ── Final dedup: remove same name if it reappears later (loop roads) ──
    const seen  = new Map(); // name → index in unique
    const unique = [];
    for (const loc of localities) {
        if (seen.has(loc.name)) {
            // Update km to the latest occurrence (keeps ordering accurate)
            unique[seen.get(loc.name)].km = loc.km;
        } else {
            seen.set(loc.name, unique.length);
            unique.push({ ...loc });
        }
    }

    // ── Normalise to discoveredStop schema ─────────────────────────────────
    return unique.map((loc, i) => ({
        candidateName:         loc.name,
        candidateCoordinates:  { lat: loc.lat, lng: loc.lng },
        googlePlaceId:         null,
        distanceFromOriginKm:  Math.round(loc.km * 10) / 10,
        durationFromOriginMins: totalDistanceKm > 0
            ? Math.round((loc.km / totalDistanceKm) * totalDurationMins)
            : null,
        sequenceOrder:          i,
        adminAction:            "PENDING",
        routeStopId:            null,
        mergedIntoRouteStopId:  null,
        source:                 "REVERSE_GEOCODE",
    }));
};

module.exports = { discoverStopsAlongRoute };

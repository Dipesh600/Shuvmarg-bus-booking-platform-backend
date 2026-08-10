/**
 * services/googlePlacesClient.js
 *
 * Produces review-only place observations along a selected Google road route.
 * Search Along Route transit POIs are primary. Sampled reverse-geocoded
 * localities are low-confidence gap-fillers only when no transit POI exists.
 * Neither signal is automatically treated as a verified bus-served stop.
 *
 * Required ENV:
 *   GOOGLE_MAPS_API_KEY  — key with Geocoding API enabled
 */

const axios = require("axios");
const {
    ZONE_MID_INTERVAL, ZONE_NEAR_INTERVAL, ZONE_NEAR_KM, sampleZoneAware,
} = require("./googlePlacesRouteSampling.js");
const { searchTransitPlacesAlongRoute } = require("./googlePlacesSearchAlongRoute.js");
const { googleAdministrativeContext } = require("./googlePlaceAdministrativeContext.js");

const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

const GEOCODE_CONCURRENCY = 6;
const GEOCODE_WORKER_DELAY_MS = 150;

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
        timeout: 2_500,
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
                    formattedAddress: result.formatted_address || null,
                    googlePlaceId: result.place_id || null,
                    administrativeContext: googleAdministrativeContext(components),
                };
            }
        }
    }

    return null;
};

async function mapWithConcurrency(values, concurrency, worker) {
    const results = new Array(values.length);
    let cursor = 0;
    async function run() {
        while (cursor < values.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await worker(values[index], index);
            await new Promise(resolve => setTimeout(resolve, GEOCODE_WORKER_DELAY_MS));
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
    return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Produce locality/place suggestions along a route polyline. A human must
 * review every suggestion before it becomes a canonical platform Stop.
 *
 * @param {Object} geometry          GeoJSON LineString
 * @param {number} totalDistanceKm
 * @param {number} totalDurationMins
 * @param {string} originName        For logging only
 * @param {string} destinationName   For logging only
 * @param {Object} options
 * @param {number} options.maxSamples Maximum provider calls for one review.
 * @returns {Array} Ordered locality candidates
 */
const discoverStopsAlongRoute = async (
    geometry,
    totalDistanceKm = 0,
    totalDurationMins = 0,
    originName = "",
    destinationName = "",
    options = {},
) => {
    const token = process.env.GOOGLE_MAPS_API_KEY;

    if (!token || token === "your_google_maps_api_key_here") {
        throw new Error("GOOGLE_MAPS_API_KEY is not set. Add it to your .env file.");
    }
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
        throw new Error("geometry must be a valid GeoJSON LineString.");
    }

    const coords  = geometry.coordinates; // [[lng, lat], ...]
    const samples = sampleZoneAware(
        coords,
        totalDistanceKm || 0,
        options.maxSamples || null,
    );

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

    const observations = await mapWithConcurrency(samples, GEOCODE_CONCURRENCY, async ({ point: [lng, lat], km }) => {
        try {
            const result = await _reverseGeocode(lat, lng, token);
            return result ? { ...result, km, lat, lng } : null;
        } catch (err) {
            // Rethrow fatal errors
            if (err.message.includes("denied") || err.message.includes("quota")) throw err;
            // Transient errors — skip this point silently
            return null;
        }
    });
    for (const observation of observations) {
        if (!observation || observation.name === lastLocalityName) continue;
        localities.push(observation);
        lastLocalityName = observation.name;
    }

    console.log(
        `[Geocode] Found ${localities.length} distinct localities ` +
        `(${samples.length} points sampled).`
    );

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
    const localitySuggestions = unique.map((loc, i) => ({
        candidateName:         loc.name,
        candidateCoordinates:  { lat: loc.lat, lng: loc.lng },
        googlePlaceId:         loc.googlePlaceId || null,
        formattedAddress:      loc.formattedAddress || null,
        administrativeContext: loc.administrativeContext || null,
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

    // Transit POIs answer a different question from localities. They are
    // boarding-location evidence, never substitutes for passenger-recognized
    // route stops. Keep both signals so a sparse Search Along Route response
    // cannot suppress the path-locality coverage.
    if (!options.encodedPolyline) return localitySuggestions;
    let transitSuggestions = [];
    try {
        transitSuggestions = await searchTransitPlacesAlongRoute(options.encodedPolyline);
    } catch (error) {
        console.warn(`[Places] Transit evidence unavailable: ${error.message}`);
    }
    return [...localitySuggestions, ...transitSuggestions];
};

module.exports = { discoverStopsAlongRoute };

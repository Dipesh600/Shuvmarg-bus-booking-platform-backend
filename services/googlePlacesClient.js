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

const {
    ZONE_MID_INTERVAL, ZONE_NEAR_INTERVAL, ZONE_NEAR_KM, sampleZoneAware,
} = require("./googlePlacesRouteSampling.js");
const { searchTransitPlacesAlongRoute } = require("./googlePlacesSearchAlongRoute.js");
const { reverseGeocode, mapWithConcurrency } = require("./googlePlacesGeocoding.js");

const GEOCODE_CONCURRENCY = 6;
const GEOCODE_WORKER_DELAY_MS = 150;

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
    const maxGap = (values) => values.slice(1).reduce((largest, sample, index) =>
        Math.max(largest, sample.km - values[index].km), 0);
    const originSpacing = maxGap(samples.filter(sample => sample.km <= ZONE_NEAR_KM));
    const destinationSpacing = maxGap(samples.filter(sample =>
        sample.km >= Math.max(0, totalDistanceKm - ZONE_NEAR_KM)
    ));
    const zoneDesc = useZones
        ? `first/last ${ZONE_NEAR_KM}km sampled at up to ` +
          `${Math.max(originSpacing, destinationSpacing).toFixed(1)}km gaps after request-budget limits`
        : `dense ${ZONE_NEAR_INTERVAL * 1000}m throughout (short route)`;

    console.log(
        `[Geocode] ${originName || "?"} → ${destinationName || "?"}: ` +
        `${samples.length} sample points (${zoneDesc}) along ` +
        `${Math.round(totalDistanceKm)}km route.`
    );

    // ── Reverse-geocode each sample point ──────────────────────────────────
    const localities = []; // { name, km, lat, lng }
    let lastLocalityName = null;

    const observations = await mapWithConcurrency(
      samples, GEOCODE_CONCURRENCY, GEOCODE_WORKER_DELAY_MS,
      async ({ point: [lng, lat], km }) => {
        try {
            const result = await reverseGeocode(lat, lng, token);
            return result ? { ...result, km, lat, lng } : null;
        } catch (err) {
            // Rethrow fatal errors
            if (err.message.includes("denied") || err.message.includes("quota")) throw err;
            // Transient errors — skip this point silently
            return null;
        }
      }
    );
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
    const seen  = new Map(); // geographic locality identity → index in unique
    const unique = [];
    for (const loc of localities) {
        const context = loc.administrativeContext || {};
        const identity = [loc.name, context.district, context.municipality]
            .map(value => String(value || "").normalize("NFKC").toLocaleLowerCase().trim())
            .join(":");
        if (seen.has(identity)) {
            const existing = unique[seen.get(identity)];
            existing.observationCount += 1;
            existing.lastObservedKm = loc.km;
            // Keep a representative point near the centre of the observed
            // locality rather than whichever sampled road point happened last.
            if (existing.observationCount % 2 === 0) {
                existing.km = loc.km;
                existing.lat = loc.lat;
                existing.lng = loc.lng;
            }
        } else {
            seen.set(identity, unique.length);
            unique.push({
                ...loc, observationCount: 1,
                firstObservedKm: loc.km, lastObservedKm: loc.km,
            });
        }
    }

    // ── Normalise to discoveredStop schema ─────────────────────────────────
    const localitySuggestions = unique.map((loc, i) => ({
        candidateName:         loc.name,
        candidateCoordinates:  { lat: loc.lat, lng: loc.lng },
        googlePlaceId:         loc.googlePlaceId || null,
        formattedAddress:      loc.formattedAddress || null,
        administrativeContext: loc.administrativeContext || null,
        observationCount:      loc.observationCount,
        observedSpanKm:        Math.max(0, loc.lastObservedKm - loc.firstObservedKm),
        googleTypes:           [loc.type].filter(Boolean),
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

const RouteDiscovery = require("../models/routeDiscoveryModel.js");
const Stop = require("../models/stopModel.js");
const StopPoint = require("../models/stopPointModel.js");
const RouteStop = require("../models/routeStopModel.js");
const RouteCorridor = require("../models/routeCorridorModel.js");
const RouteVariant = require("../models/routeVariantModel.js");
const { fetchRouteOptions, extractStopCoordinates, geocodeStopName } = require("./mapboxClient.js");
const { discoverStopsAlongRoute } = require("./googlePlacesClient.js");
const axios = require("axios");
const minimaxClient = require("./minimaxClient.js");

/**
 * Reverse-geocode a lat/lng coordinate using Google Geocoding API and extract
 * the Nepal administrative hierarchy: province, district, municipality.
 *
 * Returns { province, district, municipality } — any field may be empty string
 * if Google does not return that level for the given coordinate.
 * Swallows all errors and returns empty strings so a geocoding failure never
 * blocks publishing.
 */
const _geocodeAdminBoundaries = async (lat, lng) => {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key || !lat || !lng) return { province: "", district: "", municipality: "" };

    try {
        const { data } = await axios.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            { params: { latlng: `${lat},${lng}`, key }, timeout: 8_000 }
        );

        if (data.status !== "OK" || !data.results?.length) {
            return { province: "", district: "", municipality: "" };
        }

        let province = "", district = "", municipality = "";
        const components = data.results[0].address_components || [];

        for (const comp of components) {
            if (comp.types.includes("administrative_area_level_1") && !province) {
                province = comp.long_name.replace(/ Province$/i, "").trim();
            }
            if (comp.types.includes("administrative_area_level_2") && !district) {
                district = comp.long_name.replace(/ District$/i, "").trim();
            }
            if ((comp.types.includes("locality") || comp.types.includes("sublocality")) && !municipality) {
                municipality = comp.long_name.trim();
            }
        }

        // Fallback for district: try level_3 if level_2 was missing
        if (!district) {
            const l3 = components.find(c => c.types.includes("administrative_area_level_3"));
            if (l3) district = l3.long_name.replace(/ District$/i, "").trim();
        }

        return { province, district, municipality };
    } catch {
        return { province: "", district: "", municipality: "" };
    }
};

/**
 * Haversine distance between two lat/lng points, in metres.
 */
const _haversineMetres = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * PROXIMITY_RADIUS_M — two stops within this distance are considered the same physical place.
 *
 * 800 m covers spelling variants of the same town/junction (Netraganj / Netragunj,
 * Ganj / Gunj suffixes, etc.) and minor GPS variance in road-snapping.
 * It does NOT merge neighbouring but distinct towns (inter-town spacing on Nepal
 * highways is typically 3–8 km).
 */
const PROXIMITY_RADIUS_M = 800;

/**
 * Find the closest existing Stop within PROXIMITY_RADIUS_M of the given coordinates.
 *
 * Strategy:
 *   1. Rough bounding-box query (fast — uses existing lat/lng fields).
 *   2. Exact Haversine check for each candidate.
 *   3. Return the closest within the threshold, or null.
 *
 * This is the PRIMARY deduplication signal — coordinates are more reliable
 * than spelling-dependent name matching.
 */
const _findNearbyStop = async (lat, lng) => {
    const degreeOffset = PROXIMITY_RADIUS_M / 111_000; // ~0.0072° per 800 m

    const candidates = await Stop.find({
        "coordinates.lat": { $gte: lat - degreeOffset, $lte: lat + degreeOffset },
        "coordinates.lng": { $gte: lng - degreeOffset, $lte: lng + degreeOffset },
        status: "ACTIVE",
    })
        .select("_id name aliases district municipality province coordinates")
        .lean();

    if (candidates.length === 0) return null;

    let closest = null;
    let closestDist = Infinity;

    for (const stop of candidates) {
        const sLat = stop.coordinates?.lat;
        const sLng = stop.coordinates?.lng;
        if (!sLat || !sLng) continue;
        const dist = _haversineMetres(lat, lng, sLat, sLng);
        if (dist <= PROXIMITY_RADIUS_M && dist < closestDist) {
            closest = stop;
            closestDist = dist;
        }
    }

    return closest ? { stop: closest, distanceM: Math.round(closestDist) } : null;
};

/**
 * Decode a Google Maps encoded polyline string into [[lng, lat], ...] pairs.
 * Spec: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
const _decodePolyline = (encoded) => {
    const coords = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let shift = 0, result = 0, b;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : result >> 1;
        shift = 0; result = 0;
        do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : result >> 1;
        coords.push([lng / 1e5, lat / 1e5]);  // GeoJSON is [lng, lat]
    }
    return coords;
};

// ── Status Machine ────────────────────────────────────────────────────────────
// Defines valid forward transitions. Reverse or skip transitions are rejected.
const VALID_TRANSITIONS = {
    DRAFT:            ["ROUTE_SELECTED", "REJECTED"],
    ROUTE_SELECTED:   ["STOPS_DISCOVERED", "DRAFT", "REJECTED"],
    STOPS_DISCOVERED: ["APPROVED", "ROUTE_SELECTED", "REJECTED"],
    APPROVED:         ["PUBLISHED", "STOPS_DISCOVERED", "REJECTED"],
    PUBLISHED:        [],   // Terminal — immutable
    REJECTED:         [],   // Terminal — immutable
};

const assertTransition = (current, next) => {
    if (!VALID_TRANSITIONS[current].includes(next)) {
        throw new Error(
            `Invalid status transition: ${current} → ${next}. ` +
            `Allowed from ${current}: [${VALID_TRANSITIONS[current].join(", ") || "none"}]`
        );
    }
};

// ── Create Session ────────────────────────────────────────────────────────────

/**
 * Start a new discovery session for an Origin → Destination pair.
 * Blocks creation if an active session already exists for the same pair.
 */
const createDiscoverySession = async (data, adminId) => {
    const { originStopId, destinationStopId } = data;

    if (!originStopId || !destinationStopId) {
        throw new Error("originStopId and destinationStopId are required.");
    }
    if (originStopId === destinationStopId) {
        throw new Error("Origin and destination cannot be the same stop.");
    }

    // Validate both stops exist in the registry
    const [origin, destination] = await Promise.all([
        Stop.findById(originStopId).select("name code status").lean(),
        Stop.findById(destinationStopId).select("name code status").lean(),
    ]);
    if (!origin) throw new Error(`Origin stop not found: ${originStopId}`);
    if (!destination) throw new Error(`Destination stop not found: ${destinationStopId}`);
    if (origin.status !== "ACTIVE") throw new Error(`Origin stop "${origin.name}" is not active.`);
    if (destination.status !== "ACTIVE") throw new Error(`Destination stop "${destination.name}" is not active.`);

    // Guard: block duplicate active sessions for the same O-D pair
    // (The partial DB index also enforces this, but a clear error message is better than a 500)
    const existingActive = await RouteDiscovery.findOne({
        originStopId,
        destinationStopId,
        status: { $in: ["DRAFT", "ROUTE_SELECTED", "STOPS_DISCOVERED", "APPROVED"] },
    }).select("_id status").lean();

    if (existingActive) {
        throw new Error(
            `An active discovery session already exists for ${origin.name} → ${destination.name} ` +
            `(ID: ${existingActive._id}, status: ${existingActive.status}). ` +
            `Complete or reject it before starting a new one.`
        );
    }

    const session = await RouteDiscovery.create({
        originStopId,
        destinationStopId,
        status: "DRAFT",
        createdBy: adminId,
    });

    // ── Auto-trigger Mapbox route fetch (non-blocking) ───────────────────────
    // Fires in the background so the HTTP response returns immediately.
    // Falls back to Mapbox Geocoding API when a stop has no lat/lng stored.
    setImmediate(async () => {
        try {
            let originCoords      = extractStopCoordinates(origin);
            let destinationCoords = extractStopCoordinates(destination);

            // Geocode fallback: if coordinates are missing, resolve from stop name
            if (!originCoords) {
                console.log(`[Discovery] Session ${session._id}: origin "${origin.name}" has no coords — geocoding via Mapbox.`);
                originCoords = await geocodeStopName(origin.name);
                // Persist the discovered coordinates back onto the stop record for next time
                await Stop.findByIdAndUpdate(origin._id, {
                    "coordinates.lat": originCoords.lat,
                    "coordinates.lng": originCoords.lng,
                });
            }
            if (!destinationCoords) {
                console.log(`[Discovery] Session ${session._id}: destination "${destination.name}" has no coords — geocoding via Mapbox.`);
                destinationCoords = await geocodeStopName(destination.name);
                await Stop.findByIdAndUpdate(destination._id, {
                    "coordinates.lat": destinationCoords.lat,
                    "coordinates.lng": destinationCoords.lng,
                });
            }

            const routeOptions = await fetchRouteOptions(originCoords, destinationCoords);
            await RouteDiscovery.findByIdAndUpdate(session._id, {
                routeOptions,
                errorMessage: null,   // clear any prior error
            });
            console.log(`[Discovery] Session ${session._id}: ${routeOptions.length} route option(s) loaded from Mapbox.`);
        } catch (err) {
            console.error(`[Discovery] Session ${session._id}: Mapbox fetch failed — ${err.message}`);
            // Write the error to the session so the UI can show it instead of spinning
            await RouteDiscovery.findByIdAndUpdate(session._id, {
                errorMessage: err.message,
            }).catch(() => {});
        }
    });

    return session;
};

// ── List Sessions ─────────────────────────────────────────────────────────────

const listDiscoverySessions = async (filters = {}) => {
    const query = {};

    if (filters.status) query.status = filters.status;
    if (filters.originStopId) query.originStopId = filters.originStopId;
    if (filters.destinationStopId) query.destinationStopId = filters.destinationStopId;

    const page = Math.max(1, parseInt(filters.page) || 1);
    const limit = Math.min(50, parseInt(filters.limit) || 20);
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
        RouteDiscovery.find(query)
            .populate("originStopId", "name code")
            .populate("destinationStopId", "name code")
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        RouteDiscovery.countDocuments(query),
    ]);

    return { sessions, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ── Get Single Session ────────────────────────────────────────────────────────

const getDiscoverySession = async (sessionId) => {
    const session = await RouteDiscovery.findById(sessionId)
        .populate("originStopId", "name code province district coordinates")
        .populate("destinationStopId", "name code province district coordinates")
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .populate("discoveredStops.routeStopId", "name code coordinates")
        .populate("discoveredStops.mergedIntoRouteStopId", "name code")
        .lean();

    if (!session) throw new Error("Discovery session not found.");
    return session;
};

// ── Select Route ──────────────────────────────────────────────────────────────

/**
 * Admin picks the route they approved on the frontend Google Map.
 * routeMetadata must include: summary, distanceKm, durationMins, provider.
 * routeMetadata.encodedPolyline — the Google encoded polyline of the exact road
 *   path the admin selected (including any waypoints or drags). When provided,
 *   we decode it directly instead of re-fetching Directions from the backend.
 */
const selectRouteOption = async (sessionId, routeOptionIndex, adminId, routeMetadata = {}) => {
    const session = await RouteDiscovery.findById(sessionId)
        .populate("originStopId",      "name coordinates")
        .populate("destinationStopId", "name coordinates");
    if (!session) throw new Error("Discovery session not found.");

    assertTransition(session.status, "ROUTE_SELECTED");

    // ── Build geometry from the most detailed source available ────────────────
    // Priority 1: step polylines (one per maneuver instruction) — full resolution.
    //   Together these contain every coordinate point along the road, including
    //   small villages that the overview_polyline simplifies away.
    // Priority 2: overview_polyline — simplified, kept as fallback.
    let frontendGeometry = null;

    const stepPolylines = Array.isArray(routeMetadata.stepPolylines)
        ? routeMetadata.stepPolylines
        : [];

    if (stepPolylines.length > 0) {
        // Decode and concatenate all step polylines into one LineString.
        // Adjacent steps share an endpoint so there will be duplicate consecutive
        // points — that's fine, they don't affect locality sampling.
        const allCoords = [];
        for (const encoded of stepPolylines) {
            if (encoded) {
                const pts = _decodePolyline(encoded);
                allCoords.push(...pts);
            }
        }
        if (allCoords.length > 1) {
            frontendGeometry = { type: "LineString", coordinates: allCoords };
            console.log(
                `[Discovery] Built detailed geometry from ${stepPolylines.length} step polylines ` +
                `→ ${allCoords.length} total coordinate points.`
            );
        }
    }

    // Fallback to overview_polyline
    if (!frontendGeometry && routeMetadata.encodedPolyline) {
        const decoded = _decodePolyline(routeMetadata.encodedPolyline);
        if (decoded.length > 1) {
            frontendGeometry = { type: "LineString", coordinates: decoded };
            console.log(
                `[Discovery] Using overview polyline fallback → ${decoded.length} points.`
            );
        }
    }

    if (session.routeOptions.length === 0 && routeMetadata.summary) {
        session.routeOptions = [{
            provider:        routeMetadata.provider || "GOOGLE",
            providerRouteId: `google-frontend-${Date.now()}`,
            summary:        routeMetadata.summary,
            distanceKm:     routeMetadata.distanceKm,
            durationMins:   routeMetadata.durationMins,
            geometry:       frontendGeometry,   // decoded from frontend encoded polyline
        }];
        // Force index 0 since we just created a single synthetic option
        routeOptionIndex = 0;
    }

    if (session.routeOptions.length === 0) {
        throw new Error("No route options available. Select a route on the map first.");
    }
    if (routeOptionIndex < 0 || routeOptionIndex >= session.routeOptions.length) {
        throw new Error(
            `Invalid routeOptionIndex: ${routeOptionIndex}. ` +
            `Must be between 0 and ${session.routeOptions.length - 1}.`
        );
    }

    session.selectedRouteOptionIndex = routeOptionIndex;
    session.status = "ROUTE_SELECTED";
    await session.save();

    // ── Auto-trigger Google Places stop discovery (non-blocking) ────────────
    setImmediate(async () => {
        try {
            const selectedRoute = session.routeOptions[routeOptionIndex];

            let routeGeometry = selectedRoute?.geometry ?? null;

            const originStop = session.originStopId;
            const destStop   = session.destinationStopId;
            const originName = originStop?.name  || "";
            const destName   = destStop?.name    || "";

            // Fallback: if no geometry stored (Google Maps browser flow),
            // fetch the actual Directions polyline so sample points follow the road
            // (much more accurate than a straight line between two endpoints).
            if (!routeGeometry) {
                const oCoords = extractStopCoordinates(originStop);
                const dCoords = extractStopCoordinates(destStop);

                if (oCoords && dCoords) {
                    try {
                        const { data } = await require("axios").get(
                            "https://maps.googleapis.com/maps/api/directions/json",
                            {
                                params: {
                                    origin:      `${originName || oCoords.lat + "," + oCoords.lng}, Nepal`,
                                    destination: `${destName   || dCoords.lat + "," + dCoords.lng}, Nepal`,
                                    mode:        "driving",
                                    region:      "NP",
                                    key:         process.env.GOOGLE_MAPS_API_KEY,
                                },
                                timeout: 10_000,
                            }
                        );

                        if (data.routes && data.routes.length > 0) {
                            // Decode the overview_polyline into a GeoJSON LineString
                            const encoded = data.routes[0].overview_polyline.points;
                            const decoded = _decodePolyline(encoded);
                            routeGeometry = {
                                type: "LineString",
                                coordinates: decoded,   // [[lng, lat], ...]
                            };
                            console.log(
                                `[Discovery] Session ${session._id}: fetched real Directions polyline ` +
                                `(${decoded.length} points) for stop sampling.`
                            );
                        }
                    } catch (dirErr) {
                        console.warn(
                            `[Discovery] Session ${session._id}: Directions fetch failed (${dirErr.message}), ` +
                            `falling back to straight line.`
                        );
                    }

                    // Ultimate fallback: straight line
                    if (!routeGeometry) {
                        routeGeometry = {
                            type: "LineString",
                            coordinates: [
                                [oCoords.lng, oCoords.lat],
                                [dCoords.lng, dCoords.lat],
                            ],
                        };
                        console.log(
                            `[Discovery] Session ${session._id}: using straight-line fallback ` +
                            `between ${originName} and ${destName}.`
                        );
                    }
                } else {
                    console.warn(
                        `[Discovery] Session ${session._id}: no geometry and stops have no ` +
                        `coordinates. Cannot auto-discover stops.`
                    );
                    return;
                }
            }

            const discovered = await discoverStopsAlongRoute(
                routeGeometry,
                selectedRoute.distanceKm,
                selectedRoute.durationMins,
                originName,
                destName,
            );

            if (discovered.length === 0) {
                console.warn(
                    `[Discovery] Session ${session._id}: Google Places found no bus stops along route. ` +
                    `Admin will need to add stops manually.`
                );
                await RouteDiscovery.findByIdAndUpdate(session._id, {
                    discoveredStops: [],
                    status: "STOPS_DISCOVERED",
                });
                return;
            }

            await RouteDiscovery.findByIdAndUpdate(session._id, {
                discoveredStops: discovered,
                status: "STOPS_DISCOVERED",
            });
            console.log(
                `[Discovery] Session ${session._id}: ${discovered.length} stop(s) discovered via Google Places.`
            );
        } catch (err) {
            console.error(`[Discovery] Session ${session._id}: Google Places fetch failed — ${err.message}`);
        }
    });

    return session;
};

// ── Patch a Discovered Stop ───────────────────────────────────────────────────

/**
 * Admin reviews an individual discovered stop and marks it:
 *   APPROVED  — accept as-is (links to existing registry stop if routeStopId present)
 *   REJECTED  — exclude from the final sequence
 *   EDITED    — admin changed candidateName / coordinates before approving
 *   MERGED    — folded into an existing stop (sets mergedIntoRouteStopId)
 */
const patchDiscoveredStop = async (sessionId, stopSubDocId, patch, adminId) => {
    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");

    if (!["STOPS_DISCOVERED", "APPROVED"].includes(session.status)) {
        throw new Error(
            `Cannot edit stops in status "${session.status}". ` +
            `Session must be in STOPS_DISCOVERED or APPROVED status.`
        );
    }

    const stopEntry = session.discoveredStops.id(stopSubDocId);
    if (!stopEntry) throw new Error(`Discovered stop sub-document not found: ${stopSubDocId}`);

    const { adminAction, candidateName, candidateCoordinates, routeStopId, mergedIntoRouteStopId } = patch;

    if (adminAction) {
        const valid = ["PENDING", "APPROVED", "REJECTED", "EDITED", "MERGED"];
        if (!valid.includes(adminAction)) {
            throw new Error(`Invalid adminAction: "${adminAction}". Must be one of: ${valid.join(", ")}`);
        }

        if (adminAction === "MERGED" && !mergedIntoRouteStopId) {
            throw new Error("mergedIntoRouteStopId is required when adminAction is MERGED.");
        }
        if (adminAction === "MERGED") {
            const target = await Stop.findById(mergedIntoRouteStopId).select("_id name").lean();
            if (!target) throw new Error(`Merge target stop not found: ${mergedIntoRouteStopId}`);
            stopEntry.mergedIntoRouteStopId = mergedIntoRouteStopId;
        }
        stopEntry.adminAction = adminAction;
    }

    if (candidateName !== undefined) stopEntry.candidateName = candidateName;
    if (candidateCoordinates !== undefined) stopEntry.candidateCoordinates = candidateCoordinates;
    if (routeStopId !== undefined) stopEntry.routeStopId = routeStopId || null;

    await session.save();
    return session;
};

// ── Refine Stops with LLM ──────────────────────────────────────────────────────

const refineStopsWithLLM = async (sessionId, adminId, onChunk) => {
    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");
    
    if (session.status !== "STOPS_DISCOVERED" && session.status !== "APPROVED") {
        throw new Error("Stops can only be refined when in STOPS_DISCOVERED or APPROVED status.");
    }
    
    if (session.discoveredStops.length === 0) {
        throw new Error("No stops to refine.");
    }
    
    // Get polyline from the selected route option if available
    let polyline = "N/A";
    if (session.selectedRouteOptionIndex !== null && session.routeOptions[session.selectedRouteOptionIndex]) {
        polyline = session.routeOptions[session.selectedRouteOptionIndex].polyline || "N/A";
    }

    // Call Minimax (streaming — onChunk is forwarded to the SSE response writer)
    const rawStopsForLLM = session.discoveredStops.map(s => ({
        candidateName: s.candidateName,
        candidateCoordinates: s.candidateCoordinates,
        distanceFromOriginKm: s.distanceFromOriginKm,
        durationFromOriginMins: s.durationFromOriginMins,
        sequenceOrder: s.sequenceOrder
    }));

    const refinedStopsList = await minimaxClient.refineStopsWithMinimax(rawStopsForLLM, polyline, onChunk);

    // Overwrite the discoveredStops with the LLM refined data
    const newDiscoveredStops = refinedStopsList.map((stop, index) => {
        return {
            candidateName: stop.candidateName,
            candidateCoordinates: stop.candidateCoordinates,
            distanceFromOriginKm: stop.distanceFromOriginKm,
            durationFromOriginMins: stop.durationFromOriginMins,
            sequenceOrder: stop.sequenceOrder !== undefined ? stop.sequenceOrder : index,
            adminAction: "PENDING", // Ready for admin review
        };
    });

    session.discoveredStops = newDiscoveredStops;
    session.isLlmRefined = true;
    
    await session.save();

    return getDiscoverySession(sessionId); // return populated session
};



// ── Approve Session ───────────────────────────────────────────────────────────

/**
 * Mark the entire session as APPROVED.
 * Validates that at least 2 stops are approved (origin + destination minimum).
 * Does NOT write to the live registry yet — that's the publish step.
 */
const approveSession = async (sessionId, adminId) => {
    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");

    assertTransition(session.status, "APPROVED");

    const approved = session.discoveredStops.filter(s => s.adminAction === "APPROVED" || s.adminAction === "EDITED");
    if (approved.length < 2) {
        throw new Error(
            `Cannot approve: at least 2 stops must be approved (origin and destination). ` +
            `Currently approved: ${approved.length}.`
        );
    }

    session.status = "APPROVED";
    session.approvedBy = adminId;
    await session.save();

    return session;
};

// ── Reject Session ────────────────────────────────────────────────────────────

const rejectSession = async (sessionId, adminId) => {
    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");

    if (session.status === "PUBLISHED") {
        throw new Error("A PUBLISHED session cannot be rejected.");
    }

    session.status = "REJECTED";
    await session.save();
    return session;
};

// ── PUBLISH ───────────────────────────────────────────────────────────────────

/**
 * THE CRITICAL ACTION. Transitions session from APPROVED → PUBLISHED.
 */
const publishSession = async (sessionId, publishData = {}, adminId) => {
    const session = await RouteDiscovery.findById(sessionId)
        .populate("originStopId", "name code")
        .populate("destinationStopId", "name code");

    if (!session) throw new Error("Discovery session not found.");
    assertTransition(session.status, "PUBLISHED");

    const origin = session.originStopId;
    const destination = session.destinationStopId;

    const activeStops = session.discoveredStops
        .filter(s => ["APPROVED", "EDITED", "MERGED"].includes(s.adminAction))
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    if (activeStops.length < 2) {
        throw new Error("Cannot publish: at least 2 approved stops required.");
    }

    const resolvedStopIds = [];

    for (const entry of activeStops) {
        let stopId;

        if (entry.adminAction === "MERGED" && entry.mergedIntoRouteStopId) {
            stopId = entry.mergedIntoRouteStopId;
        } else if (entry.routeStopId) {
            stopId = entry.routeStopId;
        } else {
            if (!entry.candidateName) {
                throw new Error(
                    `Cannot publish: stop at sequence ${entry.sequenceOrder} has no name. ` +
                    `Set candidateName or link to an existing stop before publishing.`
                );
            }

            const candidateName = entry.candidateName.trim();
            const nameLower     = candidateName.toLowerCase();
            const coords        = entry.candidateCoordinates || {};
            const hasCoords     = !!(coords.lat && coords.lng);

            let adminBoundaries = { province: "", district: "", municipality: "" };
            if (hasCoords) {
                adminBoundaries = await _geocodeAdminBoundaries(coords.lat, coords.lng);
            }

            let resolvedByProximity = null;
            if (hasCoords) {
                resolvedByProximity = await _findNearbyStop(coords.lat, coords.lng);
            }

            if (resolvedByProximity) {
                const { stop: nearStop, distanceM } = resolvedByProximity;
                stopId = nearStop._id;

                const existingAliases = (nearStop.aliases || []).map(a => a.toLowerCase());
                const canonicalLower  = nearStop.name.toLowerCase();
                if (nameLower !== canonicalLower && !existingAliases.includes(nameLower)) {
                    await Stop.findByIdAndUpdate(nearStop._id, {
                        $addToSet: { aliases: candidateName },
                    });
                }

                const needsFill =
                    (!nearStop.province && adminBoundaries.province) ||
                    (!nearStop.district && adminBoundaries.district) ||
                    (!nearStop.municipality && adminBoundaries.municipality);
                if (needsFill) {
                    await Stop.findByIdAndUpdate(nearStop._id, {
                        $set: {
                            ...(adminBoundaries.province     && !nearStop.province     && { province:     adminBoundaries.province }),
                            ...(adminBoundaries.district     && !nearStop.district     && { district:     adminBoundaries.district }),
                            ...(adminBoundaries.municipality && !nearStop.municipality && { municipality: adminBoundaries.municipality }),
                        },
                    });
                }

            } else {
                let sameNameStops = await Stop.find({ _nameLower: nameLower })
                    .select("_id name aliases district municipality province coordinates")
                    .lean();

                if (sameNameStops.length === 0) {
                    sameNameStops = await Stop.find({
                        name: { $regex: new RegExp(`^${candidateName}$`, "i") },
                    }).select("_id name aliases district municipality province coordinates").lean();
                }

                let matchedStop = null;
                if (sameNameStops.length > 0) {
                    const candidateDistrict = (adminBoundaries.district || "").toLowerCase().trim();
                    if (candidateDistrict) {
                        matchedStop = sameNameStops.find(
                            s => (s.district || "").toLowerCase().trim() === candidateDistrict
                        ) || null;
                    }
                    if (!matchedStop && !candidateDistrict) {
                        matchedStop = sameNameStops[0];
                    }
                }

                if (matchedStop) {
                    stopId = matchedStop._id;
                    const needsFill =
                        (!matchedStop.province && adminBoundaries.province) ||
                        (!matchedStop.district && adminBoundaries.district) ||
                        (!matchedStop.municipality && adminBoundaries.municipality);
                    if (needsFill) {
                        await Stop.findByIdAndUpdate(matchedStop._id, {
                            $set: {
                                ...(adminBoundaries.province     && !matchedStop.province     && { province:     adminBoundaries.province }),
                                ...(adminBoundaries.district     && !matchedStop.district     && { district:     adminBoundaries.district }),
                                ...(adminBoundaries.municipality && !matchedStop.municipality && { municipality: adminBoundaries.municipality }),
                            },
                        });
                    }
                } else {
                    const aliasMatch = await Stop.findOne({
                        aliases: { $elemMatch: { $regex: new RegExp(`^${candidateName}$`, "i") } },
                    }).select("_id name aliases district municipality province").lean();

                    if (aliasMatch) {
                        stopId = aliasMatch._id;
                        const needsFill =
                            (!aliasMatch.province && adminBoundaries.province) ||
                            (!aliasMatch.district && adminBoundaries.district) ||
                            (!aliasMatch.municipality && adminBoundaries.municipality);
                        if (needsFill) {
                            await Stop.findByIdAndUpdate(aliasMatch._id, {
                                $set: {
                                    ...(adminBoundaries.province     && !aliasMatch.province     && { province:     adminBoundaries.province }),
                                    ...(adminBoundaries.district     && !aliasMatch.district     && { district:     adminBoundaries.district }),
                                    ...(adminBoundaries.municipality && !aliasMatch.municipality && { municipality: adminBoundaries.municipality }),
                                },
                            });
                        }
                    } else {
                    const newStop = await Stop.createWithUniqueCode({
                        name:               candidateName,
                        coordinates:        coords,
                        province:           adminBoundaries.province,
                        district:           adminBoundaries.district,
                        municipality:       adminBoundaries.municipality,
                        source:             "DISCOVERY",
                        verificationStatus: "VERIFIED",
                        status:             "ACTIVE",
                        createdBy:          adminId,
                    });
                    stopId = newStop._id;

                    try {
                        const existingStopPoint = await StopPoint.findOne({ stopId: newStop._id, status: "ACTIVE" }).lean();
                        if (!existingStopPoint) {
                            await StopPoint.create({
                                stopId:            newStop._id,
                                name:              candidateName,
                                type:              "JUNCTION_POINT",
                                coordinates:       coords,
                                supportsBoarding:  true,
                                supportsDropping:  true,
                                verificationStatus: "VERIFIED",
                                source:            "DISCOVERY",
                                status:            "ACTIVE",
                                createdBy:         adminId,
                            });
                        }
                    } catch (spErr) {
                        console.error(`[Discovery] Failed to create default StopPoint for "${candidateName}": ${spErr.message}`);
                    }
                    }
                }
            }
        }

        resolvedStopIds.push({
            stopId,
            sequenceOrder: entry.sequenceOrder,
            distanceFromOriginKm: entry.distanceFromOriginKm || null,
            durationFromOriginMins: entry.durationFromOriginMins || null,
        });
    }

    let corridor = await RouteCorridor.findOne({
        originId: origin._id,
        destinationId: destination._id,
    });

    if (!corridor) {
        const corridorCode = `${origin.code || "UNK"}-${destination.code || "UNK"}`;
        corridor = await RouteCorridor.create({
            code: corridorCode,
            originId: origin._id,
            destinationId: destination._id,
            isSymmetric: true,
            status: "ACTIVE",
            createdBy: adminId,
            notes: `Auto-created by discovery session ${session._id}`,
        });
    }

    const selectedRoute = session.routeOptions[session.selectedRouteOptionIndex];
    const variantName = publishData.variantName ||
        selectedRoute?.summary ||
        `${origin.name} → ${destination.name} (Discovery)`;

    const existingVariantCount = await RouteVariant.countDocuments({ corridorId: corridor._id });
    const variantIndex = String(existingVariantCount + 1).padStart(2, "0");
    const variantCode = `${corridor.code}-V${variantIndex}`;

    const variant = await RouteVariant.create({
        code: variantCode,
        corridorId: corridor._id,
        name: variantName,
        distanceKm: selectedRoute?.distanceKm || null,
        durationMinutes: selectedRoute?.durationMins || null,
        direction: "FORWARD",
        status: "ACTIVE",
        createdBy: adminId,
    });

    // ── De-duplicate by stopId ──────────────────────────────────────────────
    // Two differently-named discovered stops can resolve to the same underlying
    // Stop document (via proximity / alias matching). The RouteStop collection
    // has a unique compound index on (variantId, stopId), so inserting both
    // would throw E11000. Keep the first occurrence (lowest sequenceOrder).
    const seenStopIds = new Set();
    const deduplicatedStopIds = resolvedStopIds.filter(entry => {
        const key = entry.stopId?.toString();
        if (!key) return false;
        if (seenStopIds.has(key)) {
            console.warn(`[Discovery] Duplicate stopId ${key} in publish — dropping extra occurrence at sequence ${entry.sequenceOrder}.`);
            return false;
        }
        seenStopIds.add(key);
        return true;
    });

    const routeStopDocs = deduplicatedStopIds.map(entry => ({
        variantId: variant._id,
        stopId: entry.stopId,
        sequence: entry.sequenceOrder + 1,
        isMajor: true,
        distanceFromOriginKm: entry.distanceFromOriginKm,
        durationFromOriginMins: entry.durationFromOriginMins,
        estimatedMinutesFromOrigin: entry.durationFromOriginMins || 0,
    }));

    try {
        await RouteStop.insertMany(routeStopDocs, { ordered: true });
    } catch (insertErr) {
        // Clean up the variant we just created so the session can be retried
        // without leaving an orphaned RouteVariant in the DB.
        await RouteVariant.findByIdAndDelete(variant._id);
        throw new Error(`Failed to publish route stops: ${insertErr.message}`);
    }

    session.publishedVariant = {
        variantId: variant._id,
        routeStopSequence: resolvedStopIds.map(e => ({
            routeStopId: e.stopId,
            sequenceOrder: e.sequenceOrder,
            distanceFromOriginKm: e.distanceFromOriginKm,
            durationFromOriginMins: e.durationFromOriginMins,
        })),
        stopPointIds: [],
    };
    session.status = "PUBLISHED";
    session.approvedBy = adminId;
    await session.save();

    return {
        session,
        corridor,
        variant,
        stopsCreated: resolvedStopIds.length,
    };
};

const setRouteOptions = async (sessionId, routeOptions) => {
    if (!Array.isArray(routeOptions) || routeOptions.length === 0) {
        throw new Error("routeOptions must be a non-empty array.");
    }

    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");

    if (!["DRAFT", "ROUTE_SELECTED"].includes(session.status)) {
        throw new Error(`Cannot update route options in status "${session.status}".`);
    }

    session.routeOptions = routeOptions;
    session.selectedRouteOptionIndex = null;
    session.status = "DRAFT";
    await session.save();

    return session;
};

const _matchCandidateStop = async (candidateName, coords) => {
    const nameLower = candidateName.trim().toLowerCase();
    const hasCoords = !!(coords && coords.lat && coords.lng);

    if (hasCoords) {
        const nearby = await _findNearbyStop(coords.lat, coords.lng);
        if (nearby) {
            const { stop: nearStop, distanceM } = nearby;
            const existingAliases = (nearStop.aliases || []).map(a => a.toLowerCase());
            const canonicalLower  = nearStop.name.toLowerCase();
            if (nameLower !== canonicalLower && !existingAliases.includes(nameLower)) {
                await Stop.findByIdAndUpdate(nearStop._id, { $addToSet: { aliases: candidateName.trim() } });
            }

            const adminBoundaries = await _geocodeAdminBoundaries(coords.lat, coords.lng);
            const needsFill =
                (!nearStop.province && adminBoundaries.province) ||
                (!nearStop.district && adminBoundaries.district) ||
                (!nearStop.municipality && adminBoundaries.municipality);
            if (needsFill) {
                await Stop.findByIdAndUpdate(nearStop._id, {
                    $set: {
                        ...(adminBoundaries.province     && !nearStop.province     && { province:     adminBoundaries.province }),
                        ...(adminBoundaries.district     && !nearStop.district     && { district:     adminBoundaries.district }),
                        ...(adminBoundaries.municipality && !nearStop.municipality && { municipality: adminBoundaries.municipality }),
                    },
                });
            }
            return { stopId: nearStop._id, matchType: "PROXIMITY", matchedName: nearStop.name };
        }
    }

    let adminBoundaries = { province: "", district: "", municipality: "" };
    if (hasCoords) {
        adminBoundaries = await _geocodeAdminBoundaries(coords.lat, coords.lng);
    }

    let sameNameStops = await Stop.find({ _nameLower: nameLower })
        .select("_id name aliases district municipality province coordinates")
        .lean();

    if (sameNameStops.length === 0) {
        sameNameStops = await Stop.find({
            name: { $regex: new RegExp(`^${candidateName.trim()}$`, "i") },
        }).select("_id name aliases district municipality province coordinates").lean();
    }

    if (sameNameStops.length > 0) {
        const candidateDistrict = (adminBoundaries.district || "").toLowerCase().trim();
        let matchedStop = null;

        if (candidateDistrict) {
            matchedStop = sameNameStops.find(
                s => (s.district || "").toLowerCase().trim() === candidateDistrict
            ) || null;
        }
        if (!matchedStop && !candidateDistrict && sameNameStops.length === 1) {
            matchedStop = sameNameStops[0];
        }

        if (matchedStop) {
            const needsFill =
                (!matchedStop.province && adminBoundaries.province) ||
                (!matchedStop.district && adminBoundaries.district) ||
                (!matchedStop.municipality && adminBoundaries.municipality);
            if (needsFill) {
                await Stop.findByIdAndUpdate(matchedStop._id, {
                    $set: {
                        ...(adminBoundaries.province     && !matchedStop.province     && { province:     adminBoundaries.province }),
                        ...(adminBoundaries.district     && !matchedStop.district     && { district:     adminBoundaries.district }),
                        ...(adminBoundaries.municipality && !matchedStop.municipality && { municipality: adminBoundaries.municipality }),
                    },
                });
            }
            return { stopId: matchedStop._id, matchType: "NAME_DISTRICT", matchedName: matchedStop.name };
        }
    }

    const aliasMatch = await Stop.findOne({
        aliases: { $elemMatch: { $regex: new RegExp(`^${candidateName.trim()}$`, "i") } },
    }).select("_id name aliases district municipality province").lean();

    if (aliasMatch) {
        return { stopId: aliasMatch._id, matchType: "ALIAS", matchedName: aliasMatch.name };
    }

    return null;
};

const setDiscoveredStops = async (sessionId, discoveredStops) => {
    if (!Array.isArray(discoveredStops) || discoveredStops.length === 0) {
        throw new Error("discoveredStops must be a non-empty array.");
    }

    const session = await RouteDiscovery.findById(sessionId);
    if (!session) throw new Error("Discovery session not found.");

    if (session.status !== "ROUTE_SELECTED") {
        throw new Error(
            `Can only set discovered stops when status is ROUTE_SELECTED. ` +
            `Current status: ${session.status}.`
        );
    }

    const resolvedStops = [];
    for (let i = 0; i < discoveredStops.length; i++) {
        const s = discoveredStops[i];
        const candidateName = (s.candidateName || "").trim();
        const coords        = s.candidateCoordinates || null;

        let routeStopId  = s.routeStopId  || null;
        let adminAction  = "PENDING";
        let matchInfo    = null;

        if (candidateName && !routeStopId) {
            try {
                matchInfo = await _matchCandidateStop(candidateName, coords);
            } catch (matchErr) {
                console.warn(`[Discovery] Match failed for "${candidateName}": ${matchErr.message}`);
            }
        }

        if (matchInfo) {
            routeStopId = matchInfo.stopId;
            adminAction = "APPROVED";
        }

        resolvedStops.push({
            ...s,
            sequenceOrder: s.sequenceOrder !== undefined ? s.sequenceOrder : i,
            routeStopId,
            adminAction,
            _matchType: matchInfo?.matchType || null,
            _matchedName: matchInfo?.matchedName || null,
        });
    }

    session.discoveredStops = resolvedStops;
    session.status = "STOPS_DISCOVERED";
    await session.save();

    return session;
};

module.exports = {
    createDiscoverySession,
    listDiscoverySessions,
    getDiscoverySession,
    selectRouteOption,
    patchDiscoveredStop,
    approveSession,
    rejectSession,
    publishSession,
    setRouteOptions,
    setDiscoveredStops,
    refineStopsWithLLM,
};

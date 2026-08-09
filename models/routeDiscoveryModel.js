const mongoose = require("mongoose");

/** Disposable map-assisted draft; live registry records are written only on publish. */

// ── Sub-Schema: Route Option (one candidate road route from the mapping provider) ──
const routeOptionSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            enum: ["MAPBOX", "GOOGLE", "OSRM"],
            required: true,
        },
        providerRouteId: {
            type: String,
            // Opaque token/ID returned by the provider for re-fetching this specific route.
            // Mapbox: directions response UUID. Google: not always present, store leg hash.
        },
        polyline: {
            type: String,
            // Encoded polyline string (Google's format, compatible with Mapbox decode too).
            // The frontend decodes this to render the route on the map.
        },
        // GeoJSON LineString returned by Mapbox — used by the admin UI map renderer
        // and by googlePlacesClient to sample points along the route for stop discovery.
        // Shape: { type: "LineString", coordinates: [[lng, lat], ...] }
        geometry: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        distanceKm: { type: Number },
        durationMins: { type: Number },
        summary: {
            type: String,
            // Human-readable route description e.g. "via BP Highway", "via Prithvi Hwy"
            // Populated from provider response, editable by admin before selection.
        },
    },
    { _id: false }
);

// ── Sub-Schema: Discovered Stop (one candidate stop proposed by the system) ──
const discoveredStopSchema = new mongoose.Schema(
    {
        // Populated if this candidate already exists in the Stop registry (deduped by distance+name).
        // null if it's a brand-new candidate that doesn't exist in the registry yet.
        routeStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            default: null,
        },
        // Used when routeStopId is null — the name the mapping provider returned.
        // Admin can edit this before approving the stop into the registry.
        candidateName: { type: String, trim: true },
        candidateCoordinates: {
            lat: { type: Number },
            lng: { type: Number },
        },
        distanceFromOriginKm: { type: Number },
        durationFromOriginMins: { type: Number },
        sequenceOrder: {
            type: Number,
            required: true,
            // 0-indexed. Admin can reorder via drag-and-drop in the review UI.
        },
        adminAction: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "EDITED", "MERGED"],
            default: "PENDING",
        },
        // Populated when adminAction = MERGED — which existing Stop this was folded into.
        mergedIntoRouteStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            default: null,
        },

        // ── Pre-match metadata (populated by setDiscoveredStops) ─────────────
        // How the system matched this candidate to an existing stop.
        // "PROXIMITY"    — within 800m of an existing stop
        // "NAME_DISTRICT"— same name + same district
        // "ALIAS"        — name matched an alias of an existing stop
        // null           — no match found; this is a genuinely new stop
        _matchType: {
            type: String,
            enum: ["PROXIMITY", "NAME_DISTRICT", "ALIAS", null],
            default: null,
        },
        // The canonical name of the matched stop (for display in the admin UI).
        _matchedName: { type: String, default: null },
    },
    // _id: true (default) — sub-documents have identity so the publish/patch controller
    // can target a specific stop by _id rather than fragile array-index positional operators.
    { _id: true }
);

// ── Sub-Schema: Published Variant Record ────────────────────────────────────────
// Written once when status transitions to PUBLISHED. Immutable after that.
// Records what was actually committed to the live RouteVariant + RouteStop collections.
const routeStopSequenceSchema = new mongoose.Schema(
    {
        routeStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        sequenceOrder: { type: Number, required: true },
        distanceFromOriginKm: { type: Number },
        durationFromOriginMins: { type: Number },
    },
    { _id: false }
);

// ── Main Schema ────────────────────────────────────────────────────────────────
const routeDiscoverySchema = new mongoose.Schema(
    {
        // Preferred entry point; legacy origin/destination drafts remain supported.
        corridorId: { type: mongoose.Schema.Types.ObjectId, ref: "RouteCorridor", default: null, index: true },
        // A return path is a separate draft, not an automatic rewrite.
        direction: { type: String, enum: ["FORWARD", "RETURN"], default: "FORWARD" },
        originStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        destinationStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            required: true,
        },
        status: {
            type: String,
            enum: [
                "DRAFT",            // Just created, no route selected yet
                "ROUTE_SELECTED",   // Admin picked one routeOption
                "STOPS_DISCOVERED", // System proposed stops, pending admin review
                "APPROVED",         // Admin has approved the stop list
                "PUBLISHED",        // Written to live registry — this doc is now read-only
                "REJECTED",         // Admin rejected the session
            ],
            default: "DRAFT",
            index: true,            // Most list views filter by status
        },

        // All candidate routes returned by the mapping provider for admin to choose from.
        routeOptions: [routeOptionSchema],

        // Index into routeOptions[] that the admin selected.
        // null until status >= ROUTE_SELECTED.
        selectedRouteOptionIndex: { type: Number, default: null },

        // Stops proposed by the system along the selected route.
        // Populated when status transitions to STOPS_DISCOVERED.
        discoveredStops: [discoveredStopSchema],

        // Indicates if the discovered stops have been fact-checked and refined by the LLM.
        isLlmRefined: {
            type: Boolean,
            default: false,
        },

        // Background job lifecycle for LLM refinement.
        // The refinement runs server-side regardless of whether the browser tab stays open.
        //   IDLE       — no job running
        //   PROCESSING — job kicked off; poll the session every few seconds
        //   DONE       — completed successfully; isLlmRefined will be true
        //   FAILED     — job errored; llmJobError contains the reason
        llmJobStatus: {
            type: String,
            enum: ["IDLE", "PROCESSING", "DONE", "FAILED"],
            default: "IDLE",
        },
        llmJobError: {
            type: String,
            default: null,
        },

        // Snapshot of what was written to the live registry on PUBLISH.
        // Only present when status = PUBLISHED.
        publishedVariant: {
            // The RouteVariant document ID that was created in the live registry
            variantId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "RouteVariant",
                default: null,
            },
            routeStopSequence: [routeStopSequenceSchema],
            stopPointIds: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "StopPoint",
                },
            ],
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },

        // Set when a background job (Mapbox/Google) fails, so the UI can surface the error.
        // Cleared when the admin triggers a successful re-fetch.
        errorMessage: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Admin list view: "show me all DRAFT sessions" — most common query pattern
routeDiscoverySchema.index({ status: 1, createdAt: -1 });
// Prevent duplicate active sessions for the same O-D pair
routeDiscoverySchema.index(
    { originStopId: 1, destinationStopId: 1, status: 1 },
    {
        // Partial index: only enforce for non-terminal states.
        // A published session should not block a new discovery session for the same corridor.
        partialFilterExpression: { status: { $in: ["DRAFT", "ROUTE_SELECTED", "STOPS_DISCOVERED", "APPROVED"] } },
    }
);

module.exports = mongoose.model("RouteDiscovery", routeDiscoverySchema);

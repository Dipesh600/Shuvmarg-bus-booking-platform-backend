const mongoose = require("mongoose");

/**
 * OPERATOR LAYER: Operator Route Configuration
 *
 * This is where bus operators configure their service ON TOP of a platform variant.
 * Operators:
 *   1. Pick a Corridor (Kathmandu → Bardibas)
 *   2. Pick a Variant (Via BP Highway)
 *   3. Select which STOPS they serve (subset of variant stops)
 *   4. For each stop: pick their allowed boarding points
 *   5. For each stop: set expected timing (arrival/departure)
 *
 * This config is then used when:
 *   - Creating a Trip (references this config instead of raw routeId)
 *   - Displaying boarding options to passengers during booking
 *   - Calculating dynamic pricing per segment later
 *
 * Key insight: Operators do NOT define geography. They configure
 * THEIR SERVICE on top of platform-defined geography.
 */
const operatorRouteConfigSchema = new mongoose.Schema(
    {
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OperatorBrand",
            required: true,
        },
        variantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "RouteVariant",
            required: true,
        },
        // ─── TRIP PATTERN ─────────────────────────────────────────────────────
        // A brand can have multiple service patterns on the same route variant.
        // e.g., "Standard" (8 stops, local) and "Express" (5 stops, fast).
        // The combination of { brandId, variantId, patternName } is unique.
        patternName: {
            type: String,
            required: true,
            default: "Standard",
            trim: true,
            maxlength: [40, "Pattern name cannot exceed 40 characters."],
        },
        // Exactly ONE pattern per variant per brand should be marked as default.
        // This is used when a schedule is created without an explicit configId.
        isDefault: {
            type: Boolean,
            default: false,
        },
        // Subset of stops from the variant that this operator serves
        // Must be a subset of RouteStop.stopIds for this variant
        activeStops: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Stop",
            },
        ],
        // For each stop the operator serves: which boarding/dropping points do they use?
        boardingConfig: [
            {
                stopId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Stop",
                },
                // Specific boarding points at this stop for this operator
                boardingPointIds: [
                    {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "BoardingPoints",
                    },
                ],
            },
        ],
        // Timing per stop for this operator's service (A → B direction)
        timingConfig: [
            {
                stopId:             { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                estimatedArrival:   { type: String, default: "" },
                // Computed = estimatedArrival + haltDuration. Stored for read performance.
                // Server always recomputes this on save if haltDuration > 0.
                estimatedDeparture: { type: String, default: "" },
                // How many minutes the bus halts at this stop (for passenger boarding/alighting).
                // Operator sets this in the admin UI. Backend derives estimatedDeparture from it.
                haltDuration:       { type: Number, default: 5, min: 0 },
                dayOffset:          { type: Number, default: 0 },
                stopBehavior:       { type: String, enum: ["BOARDING_ONLY", "DROPPING_ONLY", "BOTH", "REST_STOP"], default: "BOTH" },
            },
        ],

        // ─── RETURN DIRECTION (B → A) — stored inline, NOT a separate document ──
        // Industry standard: One OperatorRouteConfig = one bidirectional service.
        // The return leg is a sub-document on the same record, not a ghost second record.
        returnActiveStops: [
            { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
        ],
        returnBoardingConfig: [
            {
                stopId: { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                boardingPointIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BoardingPoints" }],
            },
        ],
        returnTimingConfig: [
            {
                stopId:             { type: mongoose.Schema.Types.ObjectId, ref: "Stop" },
                estimatedArrival:   { type: String, default: "" },
                estimatedDeparture: { type: String, default: "" },
                haltDuration:       { type: Number, default: 5, min: 0 },
                dayOffset:          { type: Number, default: 0 },
                stopBehavior:       { type: String, enum: ["BOARDING_ONLY", "DROPPING_ONLY", "BOTH", "REST_STOP"], default: "BOTH" },
            },
        ],
        // true  = operator has manually configured the return direction
        // false = return direction is auto-derived from the forward direction
        returnOverridden: {
            type: Boolean,
            default: false,
        },
        // ─── MINIMUM JOURNEY ENFORCEMENT ─────────────────────────────────────
        // For intercity long-haul buses, short bookings (e.g., 10km hops)
        // block a seat for the entire trip duration — commercially unacceptable.
        //
        // This field defines the minimum travel TIME (in minutes) between any
        // two stops a passenger can search/book on this operator's service.
        //
        // Enforcement is at TWO levels:
        //   1. searchTrips API  — hides this bus from results if journey is too short
        //   2. bookTicket API   — rejects the booking as a safety net (API can be called directly)
        //
        // Industry defaults by route type:
        //   Plains intercity (KTM → BRT)  : 60 mins
        //   Mountain routes               : 90 mins
        //   Express/Limited-stop services : 120 mins
        //
        // 0 = no minimum enforced (local/urban services only)
        minimumJourneyMinutes: {
            type: Number,
            default: 60,
            min: 0,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE", "PENDING_REVIEW"],
            default: "ACTIVE",
        },
        notes: {
            type: String, // Internal notes from admin during approval
        },
    },
    { timestamps: true }
);

// A brand can have multiple patterns per variant, but each pattern name must be unique per route.
operatorRouteConfigSchema.index(
    { brandId: 1, variantId: 1, patternName: 1 },
    { unique: true, name: "brandId_1_variantId_1_patternName_1" }
);
operatorRouteConfigSchema.index({ variantId: 1, status: 1 });
operatorRouteConfigSchema.index({ brandId: 1, status: 1 });

module.exports = mongoose.model("OperatorRouteConfig", operatorRouteConfigSchema);

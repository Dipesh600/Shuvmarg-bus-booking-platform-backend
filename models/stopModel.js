const mongoose = require("mongoose");

/**
 * LAYER 3: Stop Registry
 *
 * The most critical asset of the platform.
 * Every city/junction/town is a reusable node in the route graph.
 * Stops are NEVER duplicated — if Kathmandu exists, all routes reference the same record.
 *
 * Creation rule: callers MUST use Stop.createWithUniqueCode(data) instead of Stop.create(data)
 * when code is not provided. Stop.create() is intentionally left available for seeding scripts
 * that already know their code.
 */
const stopSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            unique: true,
            sparse: true,   // allows null while still enforcing uniqueness for non-null values
            uppercase: true,
            trim: true,
            // e.g., "KTM", "PKR", "HTD", "BRD"
            // Auto-generated from name if not provided at creation — see createWithUniqueCode()
        },
        name: {
            type: String,
            required: true,
            trim: true,
            // e.g., "Kathmandu", "Pokhara", "Hetauda"
        },
        // Normalised lowercase name — used for deduplication guard.
        // Kept in sync via the pre-save hook. Never write this field directly.
        // Unique index is declared below via stopSchema.index() (not here, to avoid duplicate warning).
        _nameLower: {
            type: String,
        },
        aliases: [{
            type: String,
            trim: true,
            // Alternate spellings/names the search engine should also match against.
            // e.g., ["काठमाडौं", "Kathmandu Valley", "KTM city"]
        }],
        type: {
            type: String,
            enum: ["CITY", "JUNCTION", "TOWN", "HIGHWAY_STOP", "BORDER"],
            default: "CITY",
        },
        parentStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Stop",
            default: null,
        },
        isSearchable: {
            type: Boolean,
            required: true,
            default: true,
        },
        isRouteStop: {
            type: Boolean,
            required: true,
            default: true,
        },
        province: {
            type: String,
            trim: true,
        },
        district: {
            type: String,
            trim: true,
        },
        municipality: {
            type: String,
            trim: true,
        },
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
        },
        verificationStatus: {
            type: String,
            enum: ["PENDING", "VERIFIED", "REJECTED"],
            default: "VERIFIED",
        },
        source: {
            type: String,
            enum: ["MANUAL", "DISCOVERY"],
            default: "MANUAL",
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },

        // ── Popularity Tracking ───────────────────────────────────────────────
        // Incremented only when a user explicitly SELECTS this stop in the UI.
        // Not on search, not on hover — only on confirmed selection.
        selectionCount: {
            type: Number,
            default: 0,
            index: true,
        },
        // Tracks selections in the last 30 days (reset periodically via a cron job).
        // Weighted more heavily in popularityScore so trending stops surface quickly.
        recentSelectionCount: {
            type: Number,
            default: 0,
        },
        // Computed score: (recentSelections × 2) + (lifetimeSelections × 0.2)
        // Prevents old majors drowning out newly growing destinations.
        popularityScore: {
            type: Number,
            default: 0,
            index: true,
        },
    },
    { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Full-text index for autocomplete search (name + code)
stopSchema.index({ name: "text", code: 1 });
// Aliases — enables O(1) lookup by alternate name during discovery deduplication
// MongoDB automatically indexes every element of the array field.
stopSchema.index({ aliases: 1 });
// Status-only filter (list page, inactive filter)
stopSchema.index({ status: 1 });
// Popular stops query: status filter + score sort in one pass, no in-memory sort
stopSchema.index({ status: 1, popularityScore: -1 });
// Discovery-sourced stops (admin review queue)
stopSchema.index({ source: 1, verificationStatus: 1 });

// ── Hierarchy Validation ───────────────────────────────────────────────────────
stopSchema.pre("validate", async function (next) {
    if (this.parentStopId) {
        if (this._id && this.parentStopId.equals(this._id)) {
            return next(new Error("A stop cannot be its own parent."));
        }
        
        let currentParentId = this.parentStopId;
        const StopModel = this.constructor;
        const visited = new Set();
        if (this._id) visited.add(this._id.toString());
        
        while (currentParentId) {
            if (visited.has(currentParentId.toString())) {
                return next(new Error("Parent hierarchy cycle detected."));
            }
            visited.add(currentParentId.toString());
            const parentStop = await StopModel.findById(currentParentId).select("parentStopId status").lean();
            if (!parentStop) {
                return next(new Error("Assigned parent stop does not exist."));
            }
            currentParentId = parentStop.parentStopId;
        }
    }
    next();
});

// ── Deduplication Hook ────────────────────────────────────────────────────────
/**
 * Keeps _nameLower in sync with name on every save.
 * Normalizes aliases, removing duplicates and the canonical name.
 */
stopSchema.pre("save", function (next) {
    if (this.isModified("name")) {
        this._nameLower = this.name.toLowerCase().trim();
    }
    
    if (this.isModified("aliases") && Array.isArray(this.aliases)) {
        const canonical = this._nameLower || this.name.toLowerCase().trim();
        const cleaned = new Map();
        
        this.aliases.forEach(alias => {
            if (!alias || typeof alias !== "string") return;
            const t = alias.trim();
            if (!t) return;
            const lower = t.toLowerCase();
            if (lower === canonical) return; // exclude if same as canonical name
            if (!cleaned.has(lower)) {
                cleaned.set(lower, t);
            }
        });
        this.aliases = Array.from(cleaned.values());
    }
    
    next();
});

// Unique deduplication index — enforces one record per name within a geographic context
stopSchema.index(
    { _nameLower: 1, district: 1, municipality: 1, parentStopId: 1 }, 
    { unique: true }
);

// Child queries index
stopSchema.index({ parentStopId: 1, status: 1 });

// ── Code Auto-Generation ───────────────────────────────────────────────────────
/**
 * Derives deterministic candidates from a stop name:
 *   1. First 3 consonants uppercased (e.g. "Kathmandu" → "KTM")
 *   2. Base + digit suffixes 2–5
 *   3. Base + district initials (e.g. "KTM-BG" for Bhaktapur district)
 *   4. Base + base36 timestamp (guaranteed unique, last resort)
 */
function buildCodeCandidates(name, district) {
    const letters = name.replace(/[^a-zA-Z]/g, "");
    const consonants = letters.replace(/[aeiouAEIOU]/g, "");
    let base = (consonants.length >= 3 ? consonants : letters).substring(0, 3).toUpperCase();
    if (!base) base = "STP";

    const candidates = [base, `${base}2`, `${base}3`, `${base}4`, `${base}5`];

    if (district) {
        const initials = district
            .split(/\s+/)
            .map((w) => w[0] || "")
            .join("")
            .toUpperCase();
        if (initials) candidates.push(`${base}-${initials}`);
    }

    // Absolute last resort — timestamp suffix guarantees global uniqueness
    candidates.push(`${base}-${Date.now().toString(36).toUpperCase()}`);

    return candidates;
}

/**
 * Stop.createWithUniqueCode(data)
 *
 * Use this instead of Stop.create(data) when code is not provided.
 * Works on a SHALLOW COPY of data so the caller's object is never mutated.
 * Uses the DB unique index as the source of truth — no pre-check exists() race.
 */
stopSchema.statics.createWithUniqueCode = async function (stopData) {
    // Caller supplied a code — trust it, skip generation entirely
    if (stopData.code) {
        return await this.create({ ...stopData });
    }

    const candidates = buildCodeCandidates(stopData.name, stopData.district);

    for (const candidate of candidates) {
        try {
            // Always work on a fresh copy — never mutate the caller's object
            return await this.create({ ...stopData, code: candidate });
        } catch (err) {
            const isDuplicateCode =
                err.code === 11000 &&
                err.keyPattern &&
                (err.keyPattern.code === 1 || err.keyPattern["code"] !== undefined);

            if (isDuplicateCode) continue; // Try next candidate

            throw err; // Any other error (validation, _nameLower unique clash, etc.) surfaces immediately
        }
    }

    // Should be unreachable — the timestamp candidate in buildCodeCandidates is the safety net
    throw new Error(`[StopRegistry] Could not generate a unique code for stop: "${stopData.name}"`);
};

module.exports = mongoose.model("Stop", stopSchema);

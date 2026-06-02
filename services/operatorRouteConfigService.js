const OperatorRouteConfig = require("../models/operatorRouteConfigModel.js");
const RouteVariant = require("../models/routeVariantModel.js");
const RouteStop = require("../models/routeStopModel.js");
const RouteCorridor = require("../models/routeCorridorModel.js");
const Buse = require("../models/fleetModel.js");

// ─── Timing helpers ───────────────────────────────────────────────────────────

/**
 * Convert a 12-hour time string ("05:30 AM" / "11:55 PM") to total minutes.
 * Returns -1 for empty / invalid input so callers can detect missing data.
 */
function _to12hMins(time) {
  if (!time || typeof time !== "string") return -1;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const pm = match[3].toUpperCase() === "PM";
  if (h === 12) h = 0;
  return (h + (pm ? 12 : 0)) * 60 + m;
}

/**
 * Format total-minutes-since-midnight back to "HH:MM AM/PM".
 */
function _minsTo12h(totalMins) {
  const m = totalMins % 60;
  let h24 = Math.floor(totalMins / 60) % 24;
  const pm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

/**
 * Server-side departure calculation.
 * Mirrors the admin UI's calculateDeparture() to ensure consistency.
 *
 * Formula: estimatedDeparture = estimatedArrival + haltDuration
 *
 * This is the authoritative computation — we do NOT trust the client's
 * pre-computed value because:
 *   1. The auto-derive path doesn't call calculateDeparture.
 *   2. Network or UI bugs could send stale values.
 *
 * Returns the original estimatedDeparture unchanged when:
 *   - arrival is missing/empty (origin stop — no arrival)
 *   - haltDuration is 0 (no-halt stop)
 */
function _recomputeTimingArray(entries) {
  if (!entries || entries.length === 0) return entries;

  let currentDay = 0;
  let prevTimeMins = -1; // last departure time in 12h-clock-minutes (without day offset)

  return entries.map((tc, idx) => {
    const arrival = (tc.estimatedArrival || "").trim();
    const halt    = typeof tc.haltDuration === "number" ? tc.haltDuration : 5;
    const isFirst = idx === 0;
    const isLast  = idx === entries.length - 1;

    // ── First stop: only has departure ────────────────────────────────────────
    if (isFirst) {
      const depMins = _to12hMins((tc.estimatedDeparture || "").trim());
      if (depMins >= 0) prevTimeMins = depMins; // seed the midnight-crossing tracker
      return { ...tc, dayOffset: 0 };
    }

    // ── Compute dayOffset: did we cross midnight since the last stop? ─────────
    const arrMins = _to12hMins(arrival);
    if (arrival && arrMins >= 0 && prevTimeMins >= 0 && arrMins < prevTimeMins) {
      currentDay += 1; // clock went backward → midnight crossed
    }

    // ── Last stop: arrives and terminates — clear departure ───────────────────
    if (isLast) {
      if (arrival && arrMins >= 0) prevTimeMins = arrMins;
      return { ...tc, estimatedDeparture: "", dayOffset: currentDay };
    }

    // ── Unparseable arrival → leave timing as-is, carry dayOffset ────────────
    if (!arrival || arrMins < 0) return { ...tc, dayOffset: currentDay };

    // ── Intermediate: compute departure = arrival + haltDuration ─────────────
    const rawDepMins = arrMins + halt; // may exceed 1440 if halt crosses midnight
    const clampedDep = rawDepMins % 1440;
    if (rawDepMins >= 1440) currentDay += 1; // halt itself crosses midnight
    prevTimeMins = clampedDep; // update tracker with clock-time of departure

    return { ...tc, estimatedDeparture: _minsTo12h(clampedDep), dayOffset: currentDay };
  });
}


/**
 * Create or update a named service pattern for a brand on a specific route variant.
 *
 * INDUSTRY PATTERN: GTFS Trip Patterns
 *   A brand can have multiple patterns for the same variant:
 *     - "Standard" → 8 stops (local)
 *     - "Express"  → 5 stops (fast)
 *
 *   The combination of { brandId, variantId, patternName } is unique.
 *   The first pattern created for a variant is auto-marked as isDefault=true.
 */
const upsertOperatorConfig = async (brandId, data) => {
    const {
        variantId, patternName = "Standard",
        activeStops, boardingConfig, timingConfig,
        // Return direction — optional; if provided, operator has manually configured return
        returnActiveStops: payloadReturnStops,
        returnBoardingConfig: payloadReturnBoarding,
        returnTimingConfig: payloadReturnTiming,
    } = data;

    if (!variantId) throw new Error("variantId is required.");
    if (!patternName || patternName.trim() === "") throw new Error("patternName is required.");

    // Validate variant exists — forward variants only
    const variant = await RouteVariant.findById(variantId).select("direction returnVariantId").lean();
    if (!variant) throw new Error("Route variant not found.");
    if (variant.direction === "RETURN") {
        throw new Error(
            "Cannot create a route config for a RETURN variant directly. " +
            "Configure the forward (A→B) variant — the return direction is stored inline on the same config."
        );
    }

    // Validate activeStops belong to this variant
    if (activeStops && activeStops.length > 0) {
        const variantStops = await RouteStop.find({ variantId }).select("stopId").lean();
        const variantStopIds = variantStops.map(s => s.stopId.toString());
        const invalidStops = activeStops.filter(s => !variantStopIds.includes(s.toString()));
        if (invalidStops.length > 0) {
            throw new Error(`These stops are not part of this variant: ${invalidStops.join(", ")}`);
        }
    }

    // ── Return direction resolution ───────────────────────────────────────────
    // Priority: explicit payload → auto-derive from forward
    // If the operator manually provides return data, honour it and mark returnOverridden=true.
    // If not provided, auto-derive by reversing the forward config.
    const hasExplicitReturn = payloadReturnTiming && payloadReturnTiming.length > 0;

    let returnActiveStops, returnBoardingConfig, returnTimingConfig, returnOverridden;

    if (hasExplicitReturn) {
        returnActiveStops    = payloadReturnStops    || [];
        returnBoardingConfig = payloadReturnBoarding || [];
        returnTimingConfig   = payloadReturnTiming;
        returnOverridden     = true;
    } else {
        // Auto-derive: reverse stop order, swap arrival ↔ departure.
        // Carry haltDuration so _recomputeTimingArray can recalculate departures.
        returnActiveStops    = activeStops    ? [...activeStops].reverse()    : [];
        returnBoardingConfig = boardingConfig ? [...boardingConfig].reverse() : [];
        returnTimingConfig   = timingConfig && timingConfig.length > 0
            ? [...timingConfig].reverse().map(t => ({
                stopId:             t.stopId,
                estimatedArrival:   (t.estimatedDeparture || t.estimatedArrival || "").trim(),
                estimatedDeparture: (t.estimatedArrival   || t.estimatedDeparture || "").trim(),
                haltDuration:       t.haltDuration ?? 5,
                dayOffset:          0,
                stopBehavior:       t.stopBehavior ?? "BOTH",
            }))
            : [];
        returnOverridden = false;
    }

    // ── Server-side departure recomputation ───────────────────────────────────
    // Always recompute estimatedDeparture = estimatedArrival + haltDuration.
    // This corrects:
    //   1. Auto-derive path (which doesn't run calculateDeparture)
    //   2. Any stale/empty estimatedDeparture values sent from the client
    const finalTimingConfig       = _recomputeTimingArray(timingConfig       || []);
    const finalReturnTimingConfig = _recomputeTimingArray(returnTimingConfig  || []);

    // Determine if this will be the first pattern for this variant (auto-default)
    const existingPatternCount = await OperatorRouteConfig.countDocuments({ brandId, variantId });
    const shouldBeDefault = existingPatternCount === 0;

    // ONE document per { brandId, variantId, patternName } — covers both directions
    const config = await OperatorRouteConfig.findOneAndUpdate(
        { brandId, variantId, patternName: patternName.trim() },
        {
            brandId, variantId,
            patternName:         patternName.trim(),
            isDefault:           shouldBeDefault,
            activeStops,
            boardingConfig,
            timingConfig:        finalTimingConfig,
            returnActiveStops,
            returnBoardingConfig,
            returnTimingConfig:  finalReturnTimingConfig,
            returnOverridden,
        },
        { upsert: true, new: true, runValidators: true }
    );

    return config;
};




/**
 * Get all operator route configs for a given brand.
 * Groups by variantId to allow the UI to display multiple patterns per route.
 */
const getOperatorConfigs = async (brandId) => {
    return await OperatorRouteConfig.find({ brandId, status: "ACTIVE" })
        .populate({
            path: "variantId",
            populate: {
                path: "corridorId",
                populate: [{ path: "originId", select: "name code" }, { path: "destinationId", select: "name code" }]
            }
        })
        .populate("activeStops", "name code type")
        .sort({ "variantId": 1, "isDefault": -1, "patternName": 1 })
        .lean();
};

/**
 * List all named patterns for a specific variant of a brand.
 * Powers the schedule creation dropdown: user picks a specific pattern,
 * not just a generic variant.
 */
const listPatternsForVariant = async (brandId, variantId) => {
    return await OperatorRouteConfig.find({ brandId, variantId, status: "ACTIVE" })
        .select("patternName isDefault activeStops timingConfig status")
        .sort({ isDefault: -1, patternName: 1 })
        .lean();
};

/**
 * Set a different pattern as the default for its variant.
 * Clears isDefault on all sibling patterns first.
 */
const setDefaultPattern = async (brandId, configId) => {
    const config = await OperatorRouteConfig.findById(configId).lean();
    if (!config) throw new Error("Route config not found.");
    if (config.brandId.toString() !== brandId.toString()) {
        throw new Error("Unauthorized: config does not belong to this brand.");
    }

    // Clear default on all siblings
    await OperatorRouteConfig.updateMany(
        { brandId, variantId: config.variantId, _id: { $ne: configId } },
        { $set: { isDefault: false } }
    );

    return await OperatorRouteConfig.findByIdAndUpdate(
        configId,
        { $set: { isDefault: true } },
        { new: true }
    ).lean();
};

/**
 * Get all corridors + variants available for an operator to choose from.
 * Attaches existing patterns per variant so the UI can display "2 patterns configured".
 */
const getAvailableVariantsForOperator = async (brandId) => {
    const query = { status: "ACTIVE" };
    if (brandId) {
        const approvedCorridorIds = await Buse.distinct("corridorId", { brandId, corridorId: { $ne: null } });
        if (approvedCorridorIds.length > 0) {
            query.corridorId = { $in: approvedCorridorIds };
        } else {
            return [];
        }
    }

    const variants = await RouteVariant.find(query)
        .populate({
            path: "corridorId",
            populate: [
                { path: "originId", select: "name code" },
                { path: "destinationId", select: "name code" }
            ]
        })
        .sort({ "corridorId.code": 1, direction: 1 })
        .lean();

    const stopCounts = await RouteStop.aggregate([
        { $group: { _id: "$variantId", count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(stopCounts.map(s => [s._id.toString(), s.count]));

    // Attach pattern count per variant
    const variantIds = variants.map(v => v._id);
    const patternCounts = await OperatorRouteConfig.aggregate([
        { $match: { brandId: new (require("mongoose").Types.ObjectId)(brandId), variantId: { $in: variantIds } } },
        { $group: { _id: "$variantId", count: { $sum: 1 }, patterns: { $push: { name: "$patternName", isDefault: "$isDefault", id: "$_id" } } } }
    ]);
    const patternMap = Object.fromEntries(patternCounts.map(p => [p._id.toString(), { count: p.count, patterns: p.patterns }]));

    return variants.map(v => ({
        ...v,
        stopCount: countMap[v._id.toString()] || 0,
        configuredPatterns: patternMap[v._id.toString()]?.patterns || [],
        patternCount: patternMap[v._id.toString()]?.count || 0,
    }));
};

/**
 * Get stops for a variant along with a specific pattern's selection state.
 * Now accepts configId directly for precision when multiple patterns exist.
 * Falls back to finding the isDefault pattern if only variantId is given.
 */
const getVariantStopsWithConfig = async (variantId, brandId, configId = null) => {
    let config = null;
    if (configId) {
        config = await OperatorRouteConfig.findById(configId).lean();
    } else {
        // Fallback: find the default pattern for this variant
        config = await OperatorRouteConfig.findOne({ brandId, variantId, isDefault: true }).lean()
            || await OperatorRouteConfig.findOne({ brandId, variantId }).lean();
    }

    const stops = await RouteStop.find({ variantId })
        .populate("stopId", "name code type")
        .sort({ sequence: 1 })
        .lean();

    const activeStopIds = config?.activeStops?.map(s => s.toString()) || [];

    return stops.map(s => ({
        ...s,
        isActive: activeStopIds.includes(s.stopId._id.toString()),
        boardingPoints: config?.boardingConfig?.find(b => b.stopId?.toString() === s.stopId._id.toString())?.boardingPointIds || [],
        timing: config?.timingConfig?.find(t => t.stopId?.toString() === s.stopId._id.toString()) || null,
    }));
};

/**
 * Get the RETURN direction stops for a forward variant, overlaid with the
 * config's returnTimingConfig. Powers the Return tab of RouteConfigModal.
 *
 * Resolution:
 *   1. Find the forward config (by configId or default pattern).
 *   2. Look up the return variant via variant.returnVariantId.
 *   3. Fetch RouteStop[] for the return variant (sorted by sequence).
 *   4. Overlay returnTimingConfig + returnBoardingConfig from the config.
 *   5. Return the same shape as getVariantStopsWithConfig so the frontend
 *      can reuse the same rendering logic.
 */
const getReturnVariantStops = async (variantId, brandId, configId = null) => {
    // Load the variant to get its returnVariantId
    const variant = await RouteVariant.findById(variantId).select("returnVariantId direction").lean();
    if (!variant) throw new Error("Variant not found.");
    if (!variant.returnVariantId) {
        // Route has no paired return variant in the platform registry
        return { hasReturnVariant: false, stops: [], returnOverridden: false };
    }

    // Load the config (forward config — return data lives inside it)
    let config = null;
    if (configId) {
        config = await OperatorRouteConfig.findById(configId).lean();
    } else {
        config = await OperatorRouteConfig.findOne({ brandId, variantId, isDefault: true }).lean()
            || await OperatorRouteConfig.findOne({ brandId, variantId }).lean();
    }

    // Fetch return variant stops in sequence order
    const returnVariantId = variant.returnVariantId;
    const stops = await RouteStop.find({ variantId: returnVariantId })
        .populate("stopId", "name code type")
        .sort({ sequence: 1 })
        .lean();

    const returnActiveStopIds = config?.returnActiveStops?.map(s => s.toString()) || [];

    const enrichedStops = stops.map(s => ({
        ...s,
        isActive: returnActiveStopIds.length > 0
            ? returnActiveStopIds.includes(s.stopId._id.toString())
            : true, // default all active if no manual config yet
        boardingPoints: config?.returnBoardingConfig?.find(
            b => b.stopId?.toString() === s.stopId._id.toString()
        )?.boardingPointIds || [],
        timing: config?.returnTimingConfig?.find(
            t => t.stopId?.toString() === s.stopId._id.toString()
        ) || null,
    }));

    return {
        hasReturnVariant: true,
        returnVariantId,
        returnOverridden: config?.returnOverridden || false,
        configId: config?._id || null,
        stops: enrichedStops,
    };
};


module.exports = {
    upsertOperatorConfig,
    getOperatorConfigs,
    getAvailableVariantsForOperator,
    getVariantStopsWithConfig,
    getReturnVariantStops,
    listPatternsForVariant,
    setDefaultPattern,
    _recomputeTimingArray, // exported for use in updateConfig controller
};

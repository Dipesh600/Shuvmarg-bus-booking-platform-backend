const Stop = require("../models/stopModel.js");
const RouteCorridor = require("../models/routeCorridorModel.js");
const RouteVariant = require("../models/routeVariantModel.js");
const RouteStop = require("../models/routeStopModel.js");
const BoardingPoint = require("../models/boardingPointsModel.js");

// ──────────────────────────────────────────────
// LAYER 3: Stop Registry
// ──────────────────────────────────────────────

const createStop = async (data) => {
    const { code, name, type, state, coordinates, aliases } = data;
    if (!code || !name) throw new Error("Stop code and name are required.");

    const existing = await Stop.findOne({ code: code.toUpperCase() });
    if (existing) throw new Error(`Stop with code "${code.toUpperCase()}" already exists.`);

    return await Stop.create({ code, name, type, state, coordinates, aliases: aliases || [] });
};

const getAllStops = async (filter = {}) => {
    const query = { status: "ACTIVE", ...filter };
    return await Stop.find(query).sort({ name: 1 }).lean();
};

const searchStops = async (query) => {
    return await Stop.find({
        status: "ACTIVE",
        $or: [
            { name: { $regex: query, $options: "i" } },
            { code: { $regex: query, $options: "i" } },
            { aliases: { $regex: query, $options: "i" } },
        ],
    }).limit(10).lean();
};

const getStopByCode = async (code) => {
    const stop = await Stop.findOne({ code: code.toUpperCase() });
    if (!stop) throw new Error(`Stop "${code}" not found in registry.`);
    return stop;
};

// ──────────────────────────────────────────────
// LAYER 1: Route Corridors
// ──────────────────────────────────────────────

const createCorridor = async (data, adminId) => {
    const { originCode, destinationCode, isSymmetric = true, notes } = data;

    const origin = await getStopByCode(originCode);
    const destination = await getStopByCode(destinationCode);

    // Prevent duplicate corridor (regardless of direction)
    const existingForward = await RouteCorridor.findOne({ originId: origin._id, destinationId: destination._id });
    const existingReverse = await RouteCorridor.findOne({ originId: destination._id, destinationId: origin._id });

    if (existingForward || existingReverse) {
        throw new Error(`Corridor between "${origin.name}" and "${destination.name}" already exists.`);
    }

    const code = `${origin.code}-${destination.code}`;

    return await RouteCorridor.create({
        code,
        originId: origin._id,
        destinationId: destination._id,
        isSymmetric,
        notes,
        createdBy: adminId,
    });
};

const getAllCorridors = async () => {
    return await RouteCorridor.find({ status: "ACTIVE" })
        .populate("originId", "name code state")
        .populate("destinationId", "name code state")
        .sort({ code: 1 })
        .lean();
};

const getCorridorById = async (corridorId) => {
    const corridor = await RouteCorridor.findById(corridorId)
        .populate("originId")
        .populate("destinationId");
    if (!corridor) throw new Error("Corridor not found.");
    return corridor;
};

// ──────────────────────────────────────────────
// LAYER 2: Route Variants
// ──────────────────────────────────────────────

const createVariant = async (data, adminId) => {
    const { corridorId, name, type, distanceKm, durationMinutes, autoGenerateReturn = false } = data;

    const corridor = await getCorridorById(corridorId);

    // Generate a short code for this variant: e.g. KTM-BRD-V1
    const existingCount = await RouteVariant.countDocuments({ corridorId });
    const variantIndex = String(existingCount + 1).padStart(2, "0");
    const code = `${corridor.code}-V${variantIndex}`;

    const forwardVariant = await RouteVariant.create({
        code,
        corridorId,
        name,
        type,
        distanceKm,
        durationMinutes,
        direction: "FORWARD",
        createdBy: adminId,
    });

    // Auto-generate the return variant if requested
    if (autoGenerateReturn) {
        const returnCode = `${corridor.code}-V${variantIndex}R`;
        const returnVariant = await RouteVariant.create({
            code: returnCode,
            corridorId,
            name: `${name} (Return)`,
            type,
            distanceKm,
            durationMinutes,
            direction: "RETURN",
            returnVariantId: forwardVariant._id,
            createdBy: adminId,
        });

        // Link them together
        forwardVariant.returnVariantId = returnVariant._id;
        await forwardVariant.save();

        return { forward: forwardVariant, return: returnVariant };
    }

    return forwardVariant;
};

const getVariantsByCorridor = async (corridorId) => {
    return await RouteVariant.find({ corridorId, status: "ACTIVE" })
        .populate({ path: "corridorId", populate: [{ path: "originId" }, { path: "destinationId" }] })
        .sort({ direction: 1, createdAt: 1 })
        .lean();
};

const getVariantById = async (variantId) => {
    const variant = await RouteVariant.findById(variantId)
        .populate({ path: "corridorId", populate: [{ path: "originId" }, { path: "destinationId" }] });
    if (!variant) throw new Error("Route variant not found.");
    return variant;
};

// ──────────────────────────────────────────────
// LAYER 4: Route Stop Mapping
// ──────────────────────────────────────────────

/**
 * Set the full stop sequence for a variant.
 * Replaces any existing stop mappings for that variant.
 * 
 * stops: [{ stopCode, sequence, isMajor, estimatedMinutesFromOrigin }]
 */
const setVariantStops = async (variantId, stops) => {
    // Validate variant exists
    const variant = await getVariantById(variantId);

    // Resolve all stop codes to IDs in one query
    const codes = stops.map(s => s.stopCode.toUpperCase());
    const stopDocs = await Stop.find({ code: { $in: codes }, status: "ACTIVE" });

    if (stopDocs.length !== codes.length) {
        const foundCodes = stopDocs.map(s => s.code);
        const missing = codes.filter(c => !foundCodes.includes(c));
        throw new Error(`Stops not found in registry: ${missing.join(", ")}`);
    }

    const stopMap = Object.fromEntries(stopDocs.map(s => [s.code, s._id]));

    // Delete existing mappings and replace
    await RouteStop.deleteMany({ variantId });
    const routeStops = stops.map(s => ({
        variantId,
        stopId: stopMap[s.stopCode.toUpperCase()],
        sequence: s.sequence,
        isMajor: s.isMajor !== undefined ? s.isMajor : true,
        estimatedMinutesFromOrigin: s.estimatedMinutesFromOrigin || 0,
    }));

    const result = await RouteStop.insertMany(routeStops);

    // Auto-update the linked return variant stops (if this is the forward variant)
    if (variant.returnVariantId) {
        const returnVariant = await RouteVariant.findById(variant.returnVariantId);
        if (returnVariant) {
            await RouteStop.deleteMany({ variantId: returnVariant._id });
            
            const totalEstimatedMinutes = Math.max(...stops.map(s => s.estimatedMinutesFromOrigin || 0));
            const reversedStops = [...stops].reverse();
            
            const returnRouteStops = reversedStops.map((s, index) => ({
                variantId: returnVariant._id,
                stopId: stopMap[s.stopCode.toUpperCase()],
                sequence: index + 1,
                isMajor: s.isMajor !== undefined ? s.isMajor : true,
                estimatedMinutesFromOrigin: Math.max(0, totalEstimatedMinutes - (s.estimatedMinutesFromOrigin || 0)),
            }));
            
            await RouteStop.insertMany(returnRouteStops);
        }
    } else {
        // If this is the return variant, auto-update the forward variant stops
        const forwardVariant = await RouteVariant.findOne({ returnVariantId: variant._id });
        if (forwardVariant) {
            await RouteStop.deleteMany({ variantId: forwardVariant._id });
            
            const totalEstimatedMinutes = Math.max(...stops.map(s => s.estimatedMinutesFromOrigin || 0));
            const reversedStops = [...stops].reverse();
            
            const forwardRouteStops = reversedStops.map((s, index) => ({
                variantId: forwardVariant._id,
                stopId: stopMap[s.stopCode.toUpperCase()],
                sequence: index + 1,
                isMajor: s.isMajor !== undefined ? s.isMajor : true,
                estimatedMinutesFromOrigin: Math.max(0, totalEstimatedMinutes - (s.estimatedMinutesFromOrigin || 0)),
            }));
            
            await RouteStop.insertMany(forwardRouteStops);
        }
    }

    return result;
};

const getStopsForVariant = async (variantId) => {
    return await RouteStop.find({ variantId })
        .populate("stopId", "name code type state")
        .sort({ sequence: 1 })
        .lean();
};

// ──────────────────────────────────────────────
// BOARDING POINTS (now linked to Stop Registry)
// ──────────────────────────────────────────────

const createBoardingPoint = async (data) => {
    const { stopCode, pointName, landmark, type, coordinates } = data;

    // Resolve the stop
    const stop = await getStopByCode(stopCode);

    return await BoardingPoint.create({
        stopId: stop._id,
        city: stop.name,     // Kept for backward compatibility
        pointName,
        landmark,
        type,
        coordinates,
        isGlobal: true,
    });
};

const getBoardingPointsByStop = async (stopCode) => {
    const stop = await getStopByCode(stopCode);
    return await BoardingPoint.find({ stopId: stop._id, status: true })
        .populate("stopId", "name code")
        .lean();
};

// ──────────────────────────────────────────────
// CRUD: Update & Delete (with reference guards)
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// BULK IMPORT (Stop Registry)
// ──────────────────────────────────────────────

const BULK_MAX = 500;
const VALID_TYPES = ["CITY", "JUNCTION", "TOWN", "BORDER"];

/**
 * Sanitize and validate a single raw stop entry from the bulk payload.
 * Returns { ok: true, entry } or { ok: false, error, raw }
 */
const _sanitizeEntry = (raw, index) => {
    if (!raw || typeof raw !== "object") {
        return { ok: false, error: `Row ${index + 1}: must be an object.`, raw };
    }
    const code = typeof raw.code === "string" ? raw.code.trim().toUpperCase() : null;
    const name = typeof raw.name === "string" ? raw.name.trim() : null;

    if (!code) return { ok: false, error: `Row ${index + 1}: 'code' is required and must be a non-empty string.`, raw };
    if (!/^[A-Z0-9]{2,8}$/.test(code)) return { ok: false, error: `Row ${index + 1}: code "${code}" must be 2–8 uppercase letters/digits (no spaces or special characters).`, raw };
    if (!name) return { ok: false, error: `Row ${index + 1}: 'name' is required and must be a non-empty string.`, raw };
    if (name.length > 100) return { ok: false, error: `Row ${index + 1}: name is too long (max 100 characters).`, raw };

    const type = raw.type ? String(raw.type).toUpperCase().trim() : "CITY";
    if (!VALID_TYPES.includes(type)) return { ok: false, error: `Row ${index + 1}: type "${type}" is invalid. Must be one of CITY, JUNCTION, TOWN, BORDER.`, raw };

    const state = raw.state ? String(raw.state).trim().substring(0, 80) : undefined;
    
    let aliases = [];
    if (Array.isArray(raw.aliases)) {
        aliases = raw.aliases.map(a => String(a).trim()).filter(a => a.length > 0);
    } else if (typeof raw.aliases === "string") {
        aliases = raw.aliases.split(",").map(a => String(a).trim()).filter(a => a.length > 0);
    }

    // Whitelist — strip everything else
    return { ok: true, entry: { code, name, type, aliases, ...(state ? { state } : {}) } };
};

/**
 * DRY-RUN: Scan the payload against the database.
 * Returns a structured preview report. Nothing is written.
 */
const bulkPreviewStops = async (rawStops) => {
    if (!Array.isArray(rawStops)) throw new Error("Payload must be a JSON array.");
    if (rawStops.length === 0) throw new Error("Array is empty — nothing to import.");
    if (rawStops.length > BULK_MAX) throw new Error(`Batch too large. Maximum is ${BULK_MAX} stops per import. You sent ${rawStops.length}.`);

    // 1. Sanitize all entries first
    const sanitized = rawStops.map((raw, i) => _sanitizeEntry(raw, i));
    const invalid = sanitized.filter(r => !r.ok);
    const valid = sanitized.filter(r => r.ok).map(r => r.entry);

    if (valid.length === 0) {
        return { toInsert: [], duplicateCode: [], duplicateName: [], invalid: invalid.map(r => ({ error: r.error, raw: r.raw })), summary: { total: rawStops.length, new: 0, skippedCode: 0, skippedName: 0, invalid: invalid.length } };
    }

    // 2. Fetch existing stops that match any code, name, or alias in the batch
    const incomingCodes = valid.map(e => e.code);
    const incomingNames = valid.flatMap(e => [e.name.toLowerCase(), ...(e.aliases || []).map(a => a.toLowerCase())]);

    const [existingByCodes, existingByNames] = await Promise.all([
        Stop.find({ code: { $in: incomingCodes } }).select("code name aliases").lean(),
        Stop.find({ 
            $or: [
                { name: { $regex: incomingNames.map(n => `^${n}$`).join("|"), $options: "i" } },
                { aliases: { $regex: incomingNames.map(n => `^${n}$`).join("|"), $options: "i" } }
            ]
        }).select("code name aliases").lean(),
    ]);

    const existingCodeSet = new Set(existingByCodes.map(s => s.code));
    const existingNameSet = new Set(existingByNames.flatMap(s => [s.name.toLowerCase(), ...(s.aliases || []).map(a => a.toLowerCase())]));

    // 3. Classify each valid entry
    const toInsert = [];
    const duplicateCode = [];
    const duplicateName = [];

    for (const entry of valid) {
        const entryNames = [entry.name.toLowerCase(), ...(entry.aliases || []).map(a => a.toLowerCase())];
        if (existingCodeSet.has(entry.code)) {
            const match = existingByCodes.find(s => s.code === entry.code);
            duplicateCode.push({ ...entry, existingName: match?.name });
        } else if (entryNames.some(n => existingNameSet.has(n))) {
            // Find the exact match just for reporting
            const match = existingByNames.find(s => [s.name.toLowerCase(), ...(s.aliases || []).map(a => a.toLowerCase())].some(n => entryNames.includes(n)));
            duplicateName.push({ ...entry, existingCode: match?.code });
        } else {
            toInsert.push(entry);
        }
    }

    return {
        toInsert,
        duplicateCode,
        duplicateName,
        invalid: invalid.map(r => ({ error: r.error, raw: r.raw })),
        summary: {
            total: rawStops.length,
            new: toInsert.length,
            skippedCode: duplicateCode.length,
            skippedName: duplicateName.length,
            invalid: invalid.length,
        },
    };
};

/**
 * Perform the actual write of net-new stops.
 * Expects a pre-sanitized array (from preview step or re-sanitized server-side).
 */
const bulkImportStops = async (rawStops, adminId) => {
    if (!Array.isArray(rawStops)) throw new Error("Payload must be a JSON array.");
    if (rawStops.length === 0) throw new Error("Array is empty — nothing to import.");
    if (rawStops.length > BULK_MAX) throw new Error(`Batch too large. Maximum is ${BULK_MAX} stops per import.`);

    // Always re-sanitize server-side — never trust client
    const sanitized = rawStops.map((raw, i) => _sanitizeEntry(raw, i));
    const invalid = sanitized.filter(r => !r.ok);
    const valid = sanitized.filter(r => r.ok).map(r => r.entry);

    if (valid.length === 0) throw new Error("No valid entries to import after validation.");

    // Re-run duplicate check on the server (prevents race conditions)
    const codes = valid.map(e => e.code);
    const names = valid.flatMap(e => [e.name.toLowerCase(), ...(e.aliases || []).map(a => a.toLowerCase())]);

    const [existingByCodes, existingByNames] = await Promise.all([
        Stop.find({ code: { $in: codes } }).select("code").lean(),
        Stop.find({ 
            $or: [
                { name: { $regex: names.map(n => `^${n}$`).join("|"), $options: "i" } },
                { aliases: { $regex: names.map(n => `^${n}$`).join("|"), $options: "i" } }
            ]
        }).select("name aliases").lean(),
    ]);

    const existingCodeSet = new Set(existingByCodes.map(s => s.code));
    const existingNameSet = new Set(existingByNames.flatMap(s => [s.name.toLowerCase(), ...(s.aliases || []).map(a => a.toLowerCase())]));

    const toInsert = valid
        .filter(e => {
            const entryNames = [e.name.toLowerCase(), ...(e.aliases || []).map(a => a.toLowerCase())];
            return !existingCodeSet.has(e.code) && !entryNames.some(n => existingNameSet.has(n));
        })
        .map(e => ({ ...e, createdBy: adminId || null }));

    if (toInsert.length === 0) {
        return { inserted: 0, skipped: valid.length, invalidCount: invalid.length, errors: [] };
    }

    let insertedCount = 0;
    const insertErrors = [];

    try {
        const result = await Stop.insertMany(toInsert, { ordered: false });
        insertedCount = result.length;
    } catch (err) {
        // ordered:false means partial success — some docs may have been inserted
        if (err.writeErrors) {
            insertedCount = err.insertedDocs?.length ?? 0;
            err.writeErrors.forEach(we => {
                insertErrors.push({ code: toInsert[we.index]?.code, error: we.errmsg || "Write error" });
            });
        } else {
            throw err;
        }
    }

    return {
        inserted: insertedCount,
        skipped: valid.length - toInsert.length,
        invalidCount: invalid.length,
        errors: insertErrors,
    };
};

const updateStop = async (id, data) => {
    const { name, type, state, status, aliases } = data;
    const stop = await Stop.findByIdAndUpdate(
        id,
        { 
            ...(name && { name }), 
            ...(type && { type }), 
            ...(state !== undefined && { state }), 
            ...(status && { status }),
            ...(aliases !== undefined && { aliases })
        },
        { new: true, runValidators: true }
    );
    if (!stop) throw new Error("Stop not found.");
    return stop;
};

const deleteStop = async (id) => {
    const stop = await Stop.findById(id);
    if (!stop) throw new Error("Stop not found.");
    const refCount = await RouteStop.countDocuments({ stopId: id });
    if (refCount > 0) {
        throw new Error(`REFERENCED:${refCount}:Stop is used in ${refCount} route sequence(s). Remove it from those sequences first.`);
    }
    await Stop.findByIdAndDelete(id);
};

const updateCorridor = async (id, data) => {
    const { notes, isSymmetric, status } = data;
    const corridor = await RouteCorridor.findByIdAndUpdate(
        id,
        { ...(notes !== undefined && { notes }), ...(isSymmetric !== undefined && { isSymmetric }), ...(status && { status }) },
        { new: true, runValidators: true }
    ).populate("originId destinationId");
    if (!corridor) throw new Error("Corridor not found.");
    return corridor;
};

const deleteCorridor = async (id) => {
    const corridor = await RouteCorridor.findById(id);
    if (!corridor) throw new Error("Corridor not found.");

    // Guard: check fleet assignments
    const Bus = require("../models/fleetModel.js");
    const fleetCount = await Bus.countDocuments({ corridorId: id });
    if (fleetCount > 0) {
        throw new Error(`REFERENCED:${fleetCount}:${fleetCount} fleet(s) are assigned to this corridor. Reassign them first.`);
    }

    // Guard: check variants with saved stop sequences
    const variants = await RouteVariant.find({ corridorId: id });
    for (const v of variants) {
        const stopCount = await RouteStop.countDocuments({ variantId: v._id });
        if (stopCount > 0) {
            throw new Error(`REFERENCED:${stopCount}:Corridor has variants with stop sequences. Clear the stop sequences first.`);
        }
    }

    // Safe to delete — cascade variants and route stops
    const variantIds = variants.map(v => v._id);
    await RouteStop.deleteMany({ variantId: { $in: variantIds } });
    await RouteVariant.deleteMany({ corridorId: id });
    await RouteCorridor.findByIdAndDelete(id);
};

const updateVariant = async (id, data) => {
    const { name, type, distanceKm, durationMinutes, status } = data;
    const variant = await RouteVariant.findByIdAndUpdate(
        id,
        {
            ...(name && { name }),
            ...(type && { type }),
            ...(distanceKm !== undefined && { distanceKm }),
            ...(durationMinutes !== undefined && { durationMinutes }),
            ...(status && { status }),
        },
        { new: true, runValidators: true }
    );
    if (!variant) throw new Error("Variant not found.");
    return variant;
};

const deleteVariant = async (id) => {
    const variant = await RouteVariant.findById(id);
    if (!variant) throw new Error("Variant not found.");

    // Guard: check fleet assignments via operator config or direct bus assignment
    // (Simple check: if any Bus references this via operator config, block)
    const stopCount = await RouteStop.countDocuments({ variantId: id });
    // We allow deletion even if stops exist — we cascade them
    // But warn if any fleet is actually running this variant (future: check operatorConfig)
    await RouteStop.deleteMany({ variantId: id });
    await RouteVariant.findByIdAndDelete(id);
};

const updateBoardingPoint = async (id, data) => {
    const { pointName, landmark, type } = data;
    const point = await BoardingPoint.findByIdAndUpdate(
        id,
        {
            ...(pointName && { pointName }),
            ...(landmark !== undefined && { landmark }),
            ...(type && { type }),
        },
        { new: true, runValidators: true }
    );
    if (!point) throw new Error("Boarding point not found.");
    return point;
};

const deleteRegistryBoardingPoint = async (id) => {
    const point = await BoardingPoint.findByIdAndDelete(id);
    if (!point) throw new Error("Boarding point not found.");
};

module.exports = {
    // Stop Registry
    createStop,
    getAllStops,
    searchStops,
    getStopByCode,
    updateStop,
    deleteStop,
    bulkPreviewStops,
    bulkImportStops,
    // Corridors
    createCorridor,
    getAllCorridors,
    getCorridorById,
    updateCorridor,
    deleteCorridor,
    // Variants
    createVariant,
    getVariantsByCorridor,
    getVariantById,
    updateVariant,
    deleteVariant,
    // Route Stop Mapping
    setVariantStops,
    getStopsForVariant,
    // Boarding Points
    createBoardingPoint,
    getBoardingPointsByStop,
    updateBoardingPoint,
    deleteRegistryBoardingPoint,
};


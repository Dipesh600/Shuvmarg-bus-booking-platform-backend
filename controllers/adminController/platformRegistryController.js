const registry = require("../../services/platformRegistryService.js");

// ── Stop Registry ────────────────────────────

const createStop = async (req, res) => {
    try {
        const stop = await registry.createStop(req.body);
        res.status(201).json({ success: true, message: "Stop added to registry.", data: stop });
    } catch (err) {
        const status = err.message.includes("already exists") ? 409 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

const getAllStops = async (req, res) => {
    try {
        const stops = await registry.getAllStops();
        res.status(200).json({ success: true, results: stops.length, data: stops });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const searchStops = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ success: false, message: "Query parameter 'q' is required." });
        const stops = await registry.searchStops(q);
        res.status(200).json({ success: true, data: stops });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Bulk Import (Stop Registry) ──────────────────────────

/**
 * POST /registry/stops/bulk-preview
 * Dry-run: validates and scans the JSON payload against the DB.
 * Returns a classified report (toInsert / duplicateCode / duplicateName / invalid).
 * DOES NOT write anything to the database.
 */
const previewBulkImportStops = async (req, res) => {
    try {
        const rawStops = req.body;
        if (!Array.isArray(rawStops)) {
            return res.status(400).json({ success: false, message: "Request body must be a JSON array of stop objects." });
        }
        const report = await registry.bulkPreviewStops(rawStops);
        res.status(200).json({ success: true, data: report });
    } catch (err) {
        const status = err.message.includes("too large") || err.message.includes("empty") || err.message.includes("array") ? 400 : 500;
        res.status(status).json({ success: false, message: err.message });
    }
};

/**
 * POST /registry/stops/bulk-import
 * Performs the actual bulk write. Re-sanitizes and re-checks duplicates server-side
 * regardless of what the client sends, so preview and import are both independently safe.
 */
const bulkImportStops = async (req, res) => {
    try {
        const rawStops = req.body;
        if (!Array.isArray(rawStops)) {
            return res.status(400).json({ success: false, message: "Request body must be a JSON array of stop objects." });
        }
        const result = await registry.bulkImportStops(rawStops, req.adminInfo?.id);
        res.status(200).json({
            success: true,
            message: `Import complete. ${result.inserted} stop(s) added, ${result.skipped} skipped.`,
            data: result,
        });
    } catch (err) {
        const status = err.message.includes("too large") || err.message.includes("empty") || err.message.includes("array") ? 400 : 500;
        res.status(status).json({ success: false, message: err.message });
    }
};


// ── Route Corridors ────────────────────────────

const createCorridor = async (req, res) => {
    try {
        const corridor = await registry.createCorridor(req.body, req.user?.id);
        res.status(201).json({ success: true, message: "Corridor registered.", data: corridor });
    } catch (err) {
        const status = err.message.includes("already exists") ? 409 : (err.message.includes("not found") ? 404 : 400);
        res.status(status).json({ success: false, message: err.message });
    }
};

const getAllCorridors = async (req, res) => {
    try {
        const corridors = await registry.getAllCorridors();
        res.status(200).json({ success: true, results: corridors.length, data: corridors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Route Variants ────────────────────────────

const createVariant = async (req, res) => {
    try {
        const variant = await registry.createVariant(req.body, req.user?.id);
        res.status(201).json({ success: true, message: "Route variant created.", data: variant });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

const getVariantsByCorridor = async (req, res) => {
    try {
        const variants = await registry.getVariantsByCorridor(req.params.corridorId);
        res.status(200).json({ success: true, results: variants.length, data: variants });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Route Stop Mapping ────────────────────────

const setVariantStops = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { stops } = req.body;
        if (!Array.isArray(stops) || stops.length === 0) {
            return res.status(400).json({ success: false, message: "stops array is required." });
        }
        const result = await registry.setVariantStops(variantId, stops);
        res.status(200).json({ success: true, message: "Stop sequence saved.", data: result });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

const getStopsForVariant = async (req, res) => {
    try {
        const stops = await registry.getStopsForVariant(req.params.variantId);
        res.status(200).json({ success: true, results: stops.length, data: stops });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Boarding Points (Create & Read) ──────────────────────────────────────────

const createBoardingPoint = async (req, res) => {
    try {
        const point = await registry.createBoardingPoint(req.body);
        res.status(201).json({ success: true, message: "Boarding point registered.", data: point });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

const getBoardingPointsByStop = async (req, res) => {
    try {
        const points = await registry.getBoardingPointsByStop(req.params.stopCode);
        res.status(200).json({ success: true, results: points.length, data: points });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 500;
        res.status(status).json({ success: false, message: err.message });
    }
};

// ── Stop CRUD ─────────────────────────────────

const updateStop = async (req, res) => {
    try {
        const stop = await registry.updateStop(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Stop updated.", data: stop });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

const deleteStop = async (req, res) => {
    try {
        await registry.deleteStop(req.params.id);
        res.status(200).json({ success: true, message: "Stop deleted from registry." });
    } catch (err) {
        if (err.message.startsWith("REFERENCED:")) {
            const [, count, msg] = err.message.split(":");
            return res.status(409).json({ success: false, message: msg, refCount: Number(count) });
        }
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Corridor CRUD ─────────────────────────────

const updateCorridor = async (req, res) => {
    try {
        const corridor = await registry.updateCorridor(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Corridor updated.", data: corridor });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

const deleteCorridor = async (req, res) => {
    try {
        await registry.deleteCorridor(req.params.id);
        res.status(200).json({ success: true, message: "Corridor deleted." });
    } catch (err) {
        if (err.message.startsWith("REFERENCED:")) {
            const [, count, msg] = err.message.split(":");
            return res.status(409).json({ success: false, message: msg, refCount: Number(count) });
        }
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Variant CRUD ──────────────────────────────

const updateVariant = async (req, res) => {
    try {
        const variant = await registry.updateVariant(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Variant updated.", data: variant });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

const deleteVariant = async (req, res) => {
    try {
        await registry.deleteVariant(req.params.id);
        res.status(200).json({ success: true, message: "Variant deleted." });
    } catch (err) {
        if (err.message.startsWith("REFERENCED:")) {
            const [, count, msg] = err.message.split(":");
            return res.status(409).json({ success: false, message: msg, refCount: Number(count) });
        }
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Boarding Point CRUD ───────────────────────

const updateBoardingPoint = async (req, res) => {
    try {
        const point = await registry.updateBoardingPoint(req.params.id, req.body);
        res.status(200).json({ success: true, message: "Boarding point updated.", data: point });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

const deleteRegistryBoardingPoint = async (req, res) => {
    try {
        await registry.deleteRegistryBoardingPoint(req.params.id);
        res.status(200).json({ success: true, message: "Boarding point deleted." });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

module.exports = {
    createStop, getAllStops, searchStops,
    previewBulkImportStops, bulkImportStops,
    updateStop, deleteStop,
    createCorridor, getAllCorridors,
    updateCorridor, deleteCorridor,
    createVariant, getVariantsByCorridor,
    updateVariant, deleteVariant,
    setVariantStops, getStopsForVariant,
    createBoardingPoint, getBoardingPointsByStop,
    updateBoardingPoint, deleteRegistryBoardingPoint,
};


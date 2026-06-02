const svc = require("../../services/operatorRouteConfigService.js");
const { _recomputeTimingArray } = require("../../services/operatorRouteConfigService.js");
const Schedule = require("../../models/scheduleModel.js");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");

// GET /admin/operator-config/variants
const getAvailableVariants = async (req, res) => {
    try {
        const { brandId } = req.query;
        const data = await svc.getAvailableVariantsForOperator(brandId);
        res.status(200).json({ success: true, results: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /admin/operator-config/:brandId
const getOperatorConfigs = async (req, res) => {
    try {
        const data = await svc.getOperatorConfigs(req.params.brandId);
        res.status(200).json({ success: true, results: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /admin/operator-config/:brandId/variant/:variantId/stops
// Now accepts optional ?configId= for pattern-specific stop state
const getVariantStopsWithConfig = async (req, res) => {
    try {
        const { brandId, variantId } = req.params;
        const { configId } = req.query;
        const data = await svc.getVariantStopsWithConfig(variantId, brandId, configId || null);
        res.status(200).json({ success: true, results: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /admin/operator-config/:brandId/variant/:variantId/return-stops
// Returns the RETURN direction stops for a forward variant,
// overlaid with the config's returnTimingConfig / returnBoardingConfig.
// Powers the "Return (B→A)" tab in RouteConfigModal.
const getReturnVariantStops = async (req, res) => {
    try {
        const { brandId, variantId } = req.params;
        const { configId } = req.query;
        const data = await svc.getReturnVariantStops(variantId, brandId, configId || null);
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// GET /admin/operator-config/:brandId/variant/:variantId/patterns
// Returns all named patterns for a specific variant (powers schedule dropdown)
const listPatternsForVariant = async (req, res) => {
    try {
        const { brandId, variantId } = req.params;
        const data = await svc.listPatternsForVariant(brandId, variantId);
        res.status(200).json({ success: true, results: data.length, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /admin/operator-config
// Now requires patternName in body (defaults to "Standard")
const upsertOperatorConfig = async (req, res) => {
    try {
        const { brandId } = req.body;
        if (!brandId) return res.status(400).json({ success: false, message: "brandId is required." });
        const data = await svc.upsertOperatorConfig(brandId, req.body);
        res.status(200).json({ success: true, message: "Operator route configuration saved.", data });
    } catch (err) {
        const status = err.message.includes("not found") ? 404 : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/operator-config/:configId
// Update timing/stops/boarding on a route config.
// patternName updates are allowed ONLY if no schedules reference this config.
// ─────────────────────────────────────────────────────────────────────────────
const updateConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const config = await OperatorRouteConfig.findById(configId);
        if (!config) return res.status(404).json({ success: false, message: "Route config not found." });

        const activeScheduleCount = await Schedule.countDocuments({
            operatorRouteConfigId: configId,
            status: "ACTIVE",
        });
        if (activeScheduleCount > 0) {
            return res.status(409).json({
                success: false,
                message:
                    `This route config has ${activeScheduleCount} ACTIVE schedule(s). ` +
                    `Suspend all active schedules before editing the route configuration.`,
            });
        }

        // patternName rename is blocked if ANY schedule (not just active) references this config
        if (req.body.patternName && req.body.patternName !== config.patternName) {
            const totalScheduleCount = await Schedule.countDocuments({ operatorRouteConfigId: configId });
            if (totalScheduleCount > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        `Cannot rename pattern: ${totalScheduleCount} schedule(s) reference this pattern. ` +
                        `Renaming would break the historical schedule → pattern link.`,
                });
            }
        }

        const allowed = [
            "activeStops", "boardingConfig", "timingConfig",
            "returnActiveStops", "returnBoardingConfig", "returnTimingConfig", "returnOverridden",
            "notes", "patternName",
        ];
        for (const key of allowed) {
            if (req.body[key] !== undefined) config[key] = req.body[key];
        }

        // Recompute departures server-side: estimatedDeparture = estimatedArrival + haltDuration
        if (req.body.timingConfig)       config.timingConfig       = _recomputeTimingArray(config.timingConfig);
        if (req.body.returnTimingConfig) config.returnTimingConfig = _recomputeTimingArray(config.returnTimingConfig);

        await config.save();
        res.status(200).json({ success: true, message: "Route configuration updated.", data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/operator-config/:configId/status
// Toggle ACTIVE ↔ INACTIVE.
// INACTIVE hides the config from the scheduling UI.
// Cannot deactivate while ACTIVE schedules exist.
// ─────────────────────────────────────────────────────────────────────────────
const toggleConfigStatus = async (req, res) => {
    try {
        const { configId } = req.params;
        const config = await OperatorRouteConfig.findById(configId);
        if (!config) return res.status(404).json({ success: false, message: "Route config not found." });

        if (config.status === "ACTIVE") {
            const activeCount = await Schedule.countDocuments({
                operatorRouteConfigId: configId,
                status: "ACTIVE",
            });
            if (activeCount > 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        `Cannot deactivate: ${activeCount} ACTIVE schedule(s) are running on this pattern. ` +
                        `Suspend all schedules first.`,
                });
            }
            config.status = "INACTIVE";
        } else {
            config.status = "ACTIVE";
        }

        await config.save();
        res.status(200).json({
            success: true,
            message: `Route config is now ${config.status}.`,
            data: config,
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/operator-config/:configId/set-default
// Marks this pattern as the default for schedule auto-resolution.
// Clears isDefault from all sibling patterns.
// ─────────────────────────────────────────────────────────────────────────────
const setDefaultPattern = async (req, res) => {
    try {
        const { configId } = req.params;
        const { brandId } = req.body;
        if (!brandId) return res.status(400).json({ success: false, message: "brandId is required." });
        const data = await svc.setDefaultPattern(brandId, configId);
        res.status(200).json({ success: true, message: `Pattern is now the default.`, data });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/operator-config/:configId
// Hard delete. Block if any schedule references this config.
// Also cleans up auto-derived return pattern if safe.
// Edge case: if deleting the default pattern and siblings exist, force-sets
// another sibling as the new default.
// ─────────────────────────────────────────────────────────────────────────────
const deleteConfig = async (req, res) => {
    try {
        const { configId } = req.params;
        const config = await OperatorRouteConfig.findById(configId).populate({
            path: "variantId", select: "returnVariantId",
        });
        if (!config) return res.status(404).json({ success: false, message: "Route config not found." });

        const scheduleCount = await Schedule.countDocuments({ operatorRouteConfigId: configId });
        if (scheduleCount > 0) {
            return res.status(409).json({
                success: false,
                message:
                    `Cannot delete: ${scheduleCount} schedule(s) reference this pattern. ` +
                    `Archive or delete those schedules first.`,
            });
        }

        // If this was the default pattern, promote the next sibling
        if (config.isDefault) {
            const sibling = await OperatorRouteConfig.findOne({
                brandId: config.brandId,
                variantId: config.variantId,
                _id: { $ne: configId },
            });
            if (sibling) {
                sibling.isDefault = true;
                await sibling.save();
            }
        }

        // Clean up the auto-derived return pattern if it also has no schedules
        const returnVariantId = config.variantId?.returnVariantId;
        if (returnVariantId) {
            const returnConfig = await OperatorRouteConfig.findOne({
                brandId: config.brandId,
                variantId: returnVariantId,
                patternName: config.patternName,  // only delete the SAME pattern name
            });
            if (returnConfig) {
                const returnSchCount = await Schedule.countDocuments({
                    operatorRouteConfigId: returnConfig._id,
                });
                if (returnSchCount === 0) await returnConfig.deleteOne();
            }
        }

        await config.deleteOne();
        res.status(200).json({ success: true, message: "Route pattern deleted." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/brands/:brandId/route-services
// Rich brand route services view for the "Route Services" tab.
// Now groups by variant: each variant can have multiple pattern cards.
// ─────────────────────────────────────────────────────────────────────────────
const getBrandRouteServices = async (req, res) => {
    try {
        const { brandId } = req.params;

        // Only return FORWARD direction configs — the return direction is stored
        // inline on the same document (returnTimingConfig / returnActiveStops).
        // Filtering here prevents the UI from ever seeing a "ghost" second card.
        const configs = await OperatorRouteConfig.find({ brandId })
            .populate({
                path: "variantId",
                match: { direction: { $ne: "RETURN" } },   // forward only
                select: "name direction status corridorId returnVariantId",
                populate: {
                    path: "corridorId",
                    select: "originId destinationId code",
                    populate: [
                        { path: "originId",      select: "name code" },
                        { path: "destinationId", select: "name code" }
                    ]
                },
            })
            .populate("activeStops", "name code type")
            .sort({ "variantId": 1, "isDefault": -1, "patternName": 1 })
            .lean();

        // Mongoose populate with match nulls out non-matching docs — filter those out
        const forwardConfigs = configs.filter(c => c.variantId !== null);


        if (!forwardConfigs.length) {
            return res.status(200).json({
                success: true,
                results: 0,
                data: [],
                summary: { totalRoutes: 0, activeRoutes: 0, totalSchedules: 0, activeSchedules: 0 },
            });
        }

        // Batch-fetch schedule stats per operatorRouteConfigId (forward configs only)
        const configIds = forwardConfigs.map(c => c._id);
        const scheduleCounts = await Schedule.aggregate([
            { $match: { operatorRouteConfigId: { $in: configIds } } },
            { $group: { _id: { configId: "$operatorRouteConfigId", status: "$status" }, count: { $sum: 1 } } },
        ]);

        const scheduleMap = {};
        for (const row of scheduleCounts) {
            const key = row._id.configId?.toString();
            if (!key) continue;
            if (!scheduleMap[key]) scheduleMap[key] = { total: 0, active: 0, suspended: 0, draft: 0 };
            scheduleMap[key].total += row.count;
            if (row._id.status === "ACTIVE")    scheduleMap[key].active    += row.count;
            if (row._id.status === "SUSPENDED") scheduleMap[key].suspended += row.count;
            if (row._id.status === "DRAFT")     scheduleMap[key].draft     += row.count;
        }

        const enriched = forwardConfigs.map(config => {
            const cId        = config._id?.toString();
            const schedStats = scheduleMap[cId] || { total: 0, active: 0, suspended: 0, draft: 0 };
            return {
                ...config,
                scheduleStats: schedStats,
                isLive: schedStats.active > 0,
            };
        });

        const summary = {
            totalRoutes:     forwardConfigs.length,
            activeRoutes:    forwardConfigs.filter(c => c.status === "ACTIVE").length,
            totalSchedules:  Object.values(scheduleMap).reduce((a, b) => a + b.total, 0),
            activeSchedules: Object.values(scheduleMap).reduce((a, b) => a + b.active, 0),
        };

        return res.status(200).json({ success: true, results: enriched.length, data: enriched, summary });

    } catch (err) {
        console.error("getBrandRouteServices error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    getAvailableVariants,
    getOperatorConfigs,
    getVariantStopsWithConfig,
    getReturnVariantStops,
    listPatternsForVariant,
    upsertOperatorConfig,
    updateConfig,
    toggleConfigStatus,
    setDefaultPattern,
    deleteConfig,
    getBrandRouteServices,
};

const mongoose = require("mongoose");
const RouteRequest         = require("../../models/routeRequestModel.js");
const Bus                  = require("../../models/fleetModel.js");
const RouteCorridor        = require("../../models/routeCorridorModel.js");
const Stop                 = require("../../models/stopModel.js");
const RouteVariant         = require("../../models/routeVariantModel.js");
const OperatorRouteConfig  = require("../../models/operatorRouteConfigModel.js");

/**
 * GET /admin/registry/route-requests
 * List all route requests, optionally filtered by status.
 * Populates owner, fleet, and brand context for the admin inbox view.
 */
const getAllRouteRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status.toUpperCase())) {
            filter.status = status.toUpperCase();
        }

        const requests = await RouteRequest.find(filter)
            .populate("ownerId", "name phone email")
            .populate("brandId", "brandName brandCode")
            .populate({
                path: "fleetId",
                select: "busName busNumber fleetId corridorId",
                populate: {
                    path: "corridorId",
                    select: "code originId destinationId status",
                    populate: [
                        { path: "originId", select: "name code city" },
                        { path: "destinationId", select: "name code city" }
                    ]
                }
            })
            .populate("resolvedBy", "name adminId")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            results: requests.length,
            data: requests,
        });
    } catch (error) {
        console.error("getAllRouteRequests error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * GET /admin/registry/route-requests/:id
 * Get full detail of a single route request.
 */
const getRouteRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid route request ID." });
        }

        const request = await RouteRequest.findById(id)
            .populate("ownerId", "name phone email address")
            .populate("brandId", "brandName brandCode baseCity status")
            .populate({
                path: "fleetId",
                select: "busName busNumber fleetId busType corridorId approvalStatus",
                populate: {
                    path: "corridorId",
                    select: "code originId destinationId status",
                    populate: [
                        { path: "originId", select: "name code city" },
                        { path: "destinationId", select: "name code city" }
                    ]
                }
            })
            .populate("resolvedBy", "name adminId")
            .lean();

        if (!request) {
            return res.status(404).json({ success: false, message: "Route request not found." });
        }

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        console.error("getRouteRequestById error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * PATCH /admin/registry/route-requests/:id
 * Review a route request — approve (linking a corridor to the fleet) or reject (with reason).
 *
 * Approve body:
 *   { action: "APPROVE", corridorId: "<existing>", adminNotes?: "" }
 *   OR to create a new corridor inline:
 *   { action: "APPROVE", createCorridor: true, originCode: "KTM", destinationCode: "BRD", adminNotes?: "" }
 *
 * Reject body:
 *   { action: "REJECT", rejectionReason: "...", adminNotes?: "" }
 */
const reviewRouteRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, corridorId, createCorridor, originCode, destinationCode, rejectionReason, adminNotes } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid route request ID." });
        }

        if (!action || !["APPROVE", "REJECT"].includes(action.toUpperCase())) {
            return res.status(400).json({ success: false, message: "action must be 'APPROVE' or 'REJECT'." });
        }

        const routeRequest = await RouteRequest.findById(id);
        if (!routeRequest) {
            return res.status(404).json({ success: false, message: "Route request not found." });
        }

        if (routeRequest.status !== "PENDING") {
            return res.status(409).json({
                success: false,
                message: `This route request is already ${routeRequest.status}. Only PENDING requests can be reviewed.`,
            });
        }

        // ── APPROVE ───────────────────────────────────────────────────────────
        if (action.toUpperCase() === "APPROVE") {
            let resolvedCorridorId = corridorId || null;

            // Create a new corridor inline if requested
            if (createCorridor) {
                if (!originCode || !destinationCode) {
                    return res.status(400).json({
                        success: false,
                        message: "originCode and destinationCode are required when creating a new corridor.",
                    });
                }

                // Resolve or create Stop documents for origin & destination
                // Use the operator-provided city names from the route request as human-readable stop names
                const getOrCreateStop = async (code, cityName) => {
                    let stop = await Stop.findOne({ code: code.toUpperCase().trim() });
                    if (!stop) {
                        stop = await Stop.create({
                            code: code.toUpperCase().trim(),
                            name: cityName ? cityName.trim() : code.trim(),
                            type: "CITY",
                        });
                    }
                    return stop;
                };

                const originStop = await getOrCreateStop(originCode, routeRequest.originCity);
                const destinationStop = await getOrCreateStop(destinationCode, routeRequest.destinationCity);

                // Check if this corridor already exists
                let corridor = await RouteCorridor.findOne({
                    $or: [
                        { originId: originStop._id, destinationId: destinationStop._id },
                        { originId: destinationStop._id, destinationId: originStop._id, isSymmetric: true },
                    ],
                });

                if (!corridor) {
                    const code = `${originCode.toUpperCase().trim()}-${destinationCode.toUpperCase().trim()}`;
                    corridor = await RouteCorridor.create({
                        code,
                        originId: originStop._id,
                        destinationId: destinationStop._id,
                        isSymmetric: true,
                        status: "ACTIVE",
                        createdBy: req.admin?._id || null,
                        notes: `Auto-created via Route Request #${id}`,
                    });

                    // D2 FIX: Create FORWARD and RETURN variants bidirectionally linked
                    const forwardVariant = await RouteVariant.create({
                        code: `${code}-STANDARD-FWD`,
                        corridorId: corridor._id,
                        name:      "Standard Route",
                        type:      "STANDARD",
                        direction: "FORWARD",
                    });

                    const returnVariant = await RouteVariant.create({
                        code:            `${code}-STANDARD-RTN`,
                        corridorId:      corridor._id,
                        name:            `${destinationStop.name} to ${originStop.name}`,
                        type:            "STANDARD",
                        direction:       "RETURN",
                        returnVariantId: forwardVariant._id,   // Return points to Forward
                    });

                    // Back-link Forward to Return
                    await RouteVariant.findByIdAndUpdate(
                        forwardVariant._id,
                        { returnVariantId: returnVariant._id }
                    );

                    // D2 FIX: Auto-create a minimal OperatorRouteConfig for the brand
                    // This satisfies the wizard's routeConfigured step immediately.
                    // Admin can enrich it later (stops, timing, boarding points) via RouteConfigModal.
                    if (routeRequest.brandId) {
                        await OperatorRouteConfig.findOneAndUpdate(
                            { brandId: routeRequest.brandId, variantId: forwardVariant._id },
                            { brandId: routeRequest.brandId, variantId: forwardVariant._id, status: "ACTIVE", notes: "Auto-created on route request approval." },
                            { upsert: true, new: true, setDefaultsOnInsert: true }
                        );
                    }
                }

                resolvedCorridorId = corridor._id;
            }

            if (!resolvedCorridorId) {
                return res.status(400).json({
                    success: false,
                    message: "Provide an existing corridorId or set createCorridor: true with originCode & destinationCode.",
                });
            }

            // Verify the corridor exists
            const corridorExists = await RouteCorridor.findById(resolvedCorridorId).lean();
            if (!corridorExists) {
                return res.status(404).json({ success: false, message: "Corridor not found in the Platform Registry." });
            }

            // Link corridor to the fleet
            if (routeRequest.fleetId) {
                await Bus.findByIdAndUpdate(routeRequest.fleetId, { corridorId: resolvedCorridorId });
            }

            // Seal the request
            routeRequest.status = "APPROVED";
            routeRequest.adminNotes = adminNotes || "";
            routeRequest.resolvedAt = new Date();
            routeRequest.resolvedBy = req.admin?._id || null;
            await routeRequest.save();

            return res.status(200).json({
                success: true,
                message: "Route request approved. Corridor linked to fleet successfully.",
                data: routeRequest,
            });
        }

        // ── REJECT ────────────────────────────────────────────────────────────
        if (!rejectionReason || !rejectionReason.trim()) {
            return res.status(400).json({ success: false, message: "rejectionReason is required when rejecting a request." });
        }

        routeRequest.status = "REJECTED";
        routeRequest.rejectionReason = rejectionReason.trim();
        routeRequest.adminNotes = adminNotes || "";
        routeRequest.resolvedAt = new Date();
        routeRequest.resolvedBy = req.admin?._id || null;
        await routeRequest.save();

        return res.status(200).json({
            success: true,
            message: "Route request rejected.",
            data: routeRequest,
        });

    } catch (error) {
        console.error("reviewRouteRequest error:", error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "A corridor with that code already exists. Please select it instead." });
        }
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getAllRouteRequests, getRouteRequestById, reviewRouteRequest };

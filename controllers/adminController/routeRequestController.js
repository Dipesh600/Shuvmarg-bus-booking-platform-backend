const mongoose = require("mongoose");
const RouteRequest         = require("../../models/routeRequestModel.js");
const Bus                  = require("../../models/fleetModel.js");
const corridorRegistry = require(
    "../../src/modules/admin/platform-registry/corridor-registry.service.js"
);

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
                        { path: "originId", select: "name code municipality district province" },
                        { path: "destinationId", select: "name code municipality district province" }
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
                        { path: "originId", select: "name code municipality district province" },
                        { path: "destinationId", select: "name code municipality district province" }
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
 *   { action: "APPROVE", createCorridor: true,
 *     originStopId: "...", destinationStopId: "...", adminNotes?: "" }
 *
 * Reject body:
 *   { action: "REJECT", rejectionReason: "...", adminNotes?: "" }
 */
const reviewRouteRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            action, corridorId, createCorridor,
            originStopId, destinationStopId, originCode, destinationCode,
            rejectionReason, adminNotes,
        } = req.body;

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

            if (createCorridor) {
                const corridor = await corridorRegistry.findOrCreateCorridor({
                    originStopId, destinationStopId, originCode, destinationCode,
                    source: "ROUTE_REQUEST", sourceReferenceId: id,
                    notes: `Created from route request ${id}`,
                }, req.adminInfo?.id || req.admin?._id || null);
                resolvedCorridorId = corridor._id;
            }

            if (!resolvedCorridorId) {
                return res.status(400).json({
                    success: false,
                    message: "Provide an existing corridorId or set createCorridor: true with originCode & destinationCode.",
                });
            }

            await corridorRegistry.getCorridorById(resolvedCorridorId);

            // Link corridor to the fleet
            if (routeRequest.fleetId) {
                await Bus.findByIdAndUpdate(routeRequest.fleetId, { corridorId: resolvedCorridorId });
            }

            // Seal the request
            routeRequest.status = "APPROVED";
            routeRequest.adminNotes = adminNotes || "";
            routeRequest.resolvedAt = new Date();
            routeRequest.resolvedBy = req.adminInfo?.id || req.admin?._id || null;
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
        routeRequest.resolvedBy = req.adminInfo?.id || req.admin?._id || null;
        await routeRequest.save();

        return res.status(200).json({
            success: true,
            message: "Route request rejected.",
            data: routeRequest,
        });

    } catch (error) {
        console.error("reviewRouteRequest error:", error);
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false, code: error.code, message: error.message,
                details: error.details,
            });
        }
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getAllRouteRequests, getRouteRequestById, reviewRouteRequest };

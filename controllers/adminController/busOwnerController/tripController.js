const tripService = require("../../../services/tripService.js");

// Create Trip for Owner by Admin
const createTripForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        const data = await tripService.createTrip(ownerId, req.body, "ADMIN");

        return res.status(201).json({
            success: true,
            message: "Trip created successfully by admin!",
            data,
        });
    } catch (error) {
        console.error("createTripForOwner error:", error);
        return res.status(error.message.includes("found") ? 404 : 400).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Trips for a specific Owner
const getTripsByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const trips = await tripService.getTripsByOwnerId(ownerId);

        return res.status(200).json({
            success: true,
            message: "Trips fetched successfully for the owner!",
            results: trips.length,
            data: trips,
        });
    } catch (error) {
        console.error("getTripsByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get Single Trip Details (Admin)
const getTripById = async (req, res) => {
    try {
        const { id } = req.params;
        const trip = await tripService.getTripDetails(id);

        return res.status(200).json({
            success: true,
            message: "Trip details fetched successfully!",
            data: trip,
        });
    } catch (error) {
        console.error("getTripById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Update Trip by Admin
const updateTripByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedTrip = await tripService.updateTripDetails(id, req.body);

        return res.status(200).json({
            success: true,
            message: "Trip updated successfully by admin!",
            data: updatedTrip,
        });
    } catch (error) {
        console.error("updateTripByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Delete Trip by Admin
const deleteTripByAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        await tripService.removeTrip(id);

        return res.status(200).json({
            success: true,
            message: "Trip deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteTripByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Trips — Admin platform view (paginated, filterable)
const getAllTrips = async (req, res) => {
    try {
        const Trip  = require("../../../models/tripModel.js");
        const User  = require("../../../models/userModel.js");

        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 30);
        const skip   = (page - 1) * limit;
        const status = req.query.status;      // optional filter
        const date   = req.query.date;        // optional: YYYY-MM-DD

        const query = {};
        if (status && status !== "all") query.status = status;
        if (date) {
            const d = new Date(date);
            const next = new Date(d);
            next.setDate(next.getDate() + 1);
            query.tripDate = { $gte: d, $lt: next };
        }

        const [trips, total] = await Promise.all([
            Trip.find(query)
                .sort({ tripDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                // Legacy route (Path B)
                .populate("routeId",   "routeName from to")
                // New registry (Path A) — shows corridor origin→destination
                .populate({
                    path: "variantId",
                    select: "name direction",
                    populate: {
                        path: "corridorId",
                        select: "originCity destinationCity",
                    },
                })
                .populate("busId",      "busNumber busName")
                .populate("ownerId",    "name email")
                .populate("brandId",    "brandName")
                .populate("scheduleId", "departureTime recurrence")
                .lean(),
            Trip.countDocuments(query),
        ]);

        return res.status(200).json({
            success: true,
            message: "All trips fetched successfully!",
            data: {
                trips,
                pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
            },
        });
    } catch (error) {
        console.error("getAllTrips error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// Update trip status by Admin (honours state machine)
const updateTripStatusByAdmin = async (req, res) => {
    try {
        const { id }     = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: "Status is required." });
        }

        const trip = await tripService.updateTripDetails(id, { status });

        return res.status(200).json({
            success: true,
            message: `Trip status updated to '${status}' successfully!`,
            data: trip,
        });
    } catch (error) {
        console.error("updateTripStatusByAdmin error:", error);
        const status = error.message.includes("Invalid") ? 400
                      : error.message.includes("found")  ? 404
                      : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Assign a driver to a specific trip
const assignDriverToTrip = async (req, res) => {
    try {
        const { id }       = req.params;
        const { driverId } = req.body;

        if (!driverId) {
            return res.status(400).json({ success: false, message: "driverId is required." });
        }

        const trip = await tripService.assignDriver(id, driverId);

        return res.status(200).json({
            success: true,
            message: "Driver assigned successfully.",
            data: trip,
        });
    } catch (error) {
        console.error("assignDriverToTrip error:", error);
        const status = error.message.includes("not found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message });
    }
};

// Get eligible drivers for a brand (to populate the assign-driver dropdown)
const getDriversForBrand = async (req, res) => {
    try {
        const { brandId } = req.params;
        const drivers = await tripService.getDriversByBrand(brandId);
        return res.status(200).json({ success: true, results: drivers.length, data: drivers });
    } catch (error) {
        console.error("getDriversForBrand error:", error);
        const status = error.message.includes("not found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message });
    }
};

module.exports = {
    createTripForOwner,
    getTripsByOwner,
    getTripById,
    updateTripByAdmin,
    deleteTripByAdmin,
    getAllTrips,
    updateTripStatusByAdmin,
    assignDriverToTrip,
    getDriversForBrand,
};


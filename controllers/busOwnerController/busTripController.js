const tripService = require("../../services/tripService.js");

// Trip Management for Bus Owner
const createTrip = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        const data = await tripService.createTrip(userId, req.body, "OWNER");

        return res.status(201).json({
            success: true,
            message: "Trip created and seats initialized successfully!",
            data,
        });
    } catch (error) {
        console.error("createTrip error:", error);
        const status = error.message.includes("verify") ? 403 : (error.message.includes("found") ? 404 : 400);
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getMyTrips = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        const trips = await tripService.getTripsByOwnerId(userId);

        return res.status(200).json({
            success: true,
            message: "Trips fetched successfully!",
            results: trips.length,
            data: trips,
        });
    } catch (error) {
        console.error("getMyTrips error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
};

const getTripById = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { id } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        const trip = await tripService.getTripDetails(id, userId);

        return res.status(200).json({
            success: true,
            message: "Trip fetched successfully!",
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

const updateTripStatus = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { id, status } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        const trip = await tripService.updateTripDetails(id, { status }, userId);

        return res.status(200).json({
            success: true,
            message: "Trip status updated successfully!",
            data: trip,
        });
    } catch (error) {
        console.error("updateTripStatus error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const toggleTripStatus = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { id, isActive } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        if (isActive === undefined) {
            return res.status(400).json({ success: false, message: "Please provide isActive status." });
        }

        const trip = await tripService.updateTripDetails(id, { isActive }, userId);

        return res.status(200).json({
            success: true,
            message: `Trip ${isActive ? "activated" : "deactivated"} successfully!`,
            data: trip,
        });
    } catch (error) {
        console.error("toggleTripStatus error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const deleteTrip = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { id } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized. Please login first." });
        }

        await tripService.removeTrip(id, userId);

        return res.status(200).json({
            success: true,
            message: "Trip deleted successfully!",
        });
    } catch (error) {
        console.error("deleteTrip error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createTrip,
    getMyTrips,
    getTripById,
    updateTripStatus,
    toggleTripStatus,
    deleteTrip,
};
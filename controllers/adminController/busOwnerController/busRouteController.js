const busRouteService = require("../../../services/busRouteService.js");

// Create Route for Owner by Admin
const createRouteForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        const newRoute = await busRouteService.createBusRoute(ownerId, req.body);

        return res.status(201).json({
            success: true,
            message: "Route created successfully by admin!",
            data: newRoute,
        });
    } catch (error) {
        console.error("createRouteForOwner error:", error);
        const status = error.message.includes("provide") ? 400 : (error.message.includes("approve") ? 403 : 500);
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Routes for a specific Owner
const getRoutesByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const routes = await busRouteService.getBusRoutesByOwnerId(ownerId);

        return res.status(200).json({
            success: true,
            message: "Routes fetched successfully for the owner!",
            results: routes.length,
            data: routes,
        });
    } catch (error) {
        console.error("getRoutesByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Update Route by Admin
const updateRouteByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Route ID is required.",
            });
        }

        const updatedRoute = await busRouteService.updateBusRoute(id, null, req.body);

        return res.status(200).json({
            success: true,
            message: "Route updated successfully by admin!",
            data: updatedRoute,
        });
    } catch (error) {
        console.error("updateRouteByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Delete Route by Admin
const deleteRouteByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Route ID is required.",
            });
        }

        await busRouteService.deleteBusRoute(id, null);

        return res.status(200).json({
            success: true,
            message: "Route deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteRouteByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get Single Route Details
const getRouteById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Route ID is required.",
            });
        }

        const route = await busRouteService.getBusRouteById(id, null);

        return res.status(200).json({
            success: true,
            message: "Route fetched successfully!",
            data: route,
        });
    } catch (error) {
        console.error("getRouteById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createRouteForOwner,
    getRoutesByOwner,
    updateRouteByAdmin,
    deleteRouteByAdmin,
    getRouteById,
};

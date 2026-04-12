const BusOwner = require("../../models/busOwnerModel.js");
const Bus = require("../../models/fleetModel.js");
const Route = require("../../models/busRouteModel.js");
const busRouteService = require("../../services/busRouteService.js");

// Route CRUD for Bus Owner

const createRoute = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const newRoute = await busRouteService.createBusRoute(userId, req.body);

        return res.status(201).json({
            success: true,
            message: "Route created successfully!",
            data: newRoute,
        });
    } catch (error) {
        console.error("createRoute error:", error);
        const status = error.message.includes("provide") ? 400 : (error.message.includes("verify") ? 403 : 500);
        return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

const getMyRoutes = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const routes = await busRouteService.getBusRoutesByOwnerId(userId);

        return res.status(200).json({
            success: true,
            message: "Routes fetched successfully!",
            results: routes.length,
            data: routes,
        });
    } catch (error) {
        console.error("getMyRoutes error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
};

const getRouteById = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { routeId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        if (!routeId) {
            return res.status(400).json({ success: false, message: "Route ID is required." });
        }

        const route = await busRouteService.getBusRouteById(routeId, userId);

        return res.status(200).json({
            success: true,
            message: "Route fetched successfully!",
            data: route,
        });
    } catch (error) {
        console.error("getRouteById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

const updateRoute = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { routeId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        if (!routeId) {
            return res.status(400).json({ success: false, message: "Route ID is required." });
        }

        const updatedRoute = await busRouteService.updateBusRoute(routeId, userId, req.body);

        return res.status(200).json({
            success: true,
            message: "Route updated successfully!",
            data: updatedRoute,
        });
    } catch (error) {
        console.error("updateRoute error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

const deleteRoute = async (req, res) => {
    try {
        const userId = req.userInfo?.id;
        const { routeId } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        if (!routeId) {
            return res.status(400).json({ success: false, message: "Route ID is required." });
        }

        await busRouteService.deleteBusRoute(routeId, userId);

        return res.status(200).json({
            success: true,
            message: "Route deleted successfully!",
        });
    } catch (error) {
        console.error("deleteRoute error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

module.exports = {
    createRoute,
    getMyRoutes,
    getRouteById,
    updateRoute,
    deleteRoute,
};
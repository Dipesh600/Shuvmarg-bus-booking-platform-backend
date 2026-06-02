const boardingPointService = require("../../../services/boardingPointService.js");

/**
 * Create Boarding/Dropping Point
 */
const createBoardingPoint = async (req, res) => {
    try {
        const { ownerId, isGlobal } = req.body;
        // Super Admin can create global points, Owners create custom points
        const newPoint = await boardingPointService.createBoardingPoint(req.body, ownerId);

        return res.status(201).json({
            success: true,
            message: `${newPoint.type} point created successfully`,
            data: newPoint,
        });
    } catch (error) {
        console.error("createBoardingPoint error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

/**
 * Get Points by City (Global + Optional Owner Custom)
 */
const getPointsByCity = async (req, res) => {
    try {
        const { city } = req.params;
        const { ownerId, type } = req.query;

        let points;
        if (ownerId) {
            points = await boardingPointService.getPointsForOwner(city, ownerId, type);
        } else {
            points = await boardingPointService.getGlobalPointsByCity(city, type);
        }

        return res.status(200).json({
            success: true,
            message: "Points fetched successfully",
            results: points.length,
            data: points,
        });
    } catch (error) {
        console.error("getPointsByCity error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

const getBoardingPointById = async (req, res) => {
    try {
        const result = await boardingPointService.getBoardingPointById(req.params.id);
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        return res.status(404).json({ success: false, message: error.message });
    }
};

const updateBoardingPoint = async (req, res) => {
    try {
        const updated = await boardingPointService.updateBoardingPoint(req.params.id, req.body);
        return res.status(200).json({
            success: true,
            message: "Point updated successfully",
            data: updated,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteBoardingPoint = async (req, res) => {
    try {
        await boardingPointService.deleteBoardingPoint(req.params.id);
        return res.status(200).json({
            success: true,
            message: "Point deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all boarding/dropping points owned by a specific ownerId (across all cities)
 * GET /boardingPoints/owner/:ownerId
 */
const getPointsByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;
        if (!ownerId) {
            return res.status(400).json({ success: false, message: "ownerId is required." });
        }
        const points = await boardingPointService.getBoardingPointsByOwner(ownerId);
        return res.status(200).json({
            success: true,
            results: points.length,
            data: points,
        });
    } catch (error) {
        console.error("getPointsByOwner error:", error);
        return res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
};

module.exports = {
    createBoardingPoint,
    getPointsByCity,
    getBoardingPointById,
    updateBoardingPoint,
    deleteBoardingPoint,
    getPointsByOwner,
};

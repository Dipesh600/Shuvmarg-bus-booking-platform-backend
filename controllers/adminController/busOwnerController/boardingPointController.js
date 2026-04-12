const boardingPointService = require("../../../services/boardingPointService.js");

// Create Boarding Point for Owner by Admin
const createBoardingPointForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        const newBoardingPoint = await boardingPointService.createBoardingPoints(ownerId, req.body);

        return res.status(201).json({
            success: true,
            message: "Boarding points created successfully by admin!",
            data: newBoardingPoint,
        });
    } catch (error) {
        console.error("createBoardingPointForOwner error:", error);
        return res.status(error.message.includes("provide") ? 400 : 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Boarding Points for a specific Owner
const getBoardingPointsByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const boardingPoints = await boardingPointService.getBoardingPointsByUserId(ownerId);

        return res.status(200).json({
            success: true,
            message: "Boarding points fetched successfully for the owner!",
            results: boardingPoints.length,
            data: boardingPoints,
        });
    } catch (error) {
        console.error("getBoardingPointsByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Update Boarding Point by Admin
const updateBoardingPointByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        const updatedBoardingPoint = await boardingPointService.updateBoardingPoints(id, null, req.body);

        return res.status(200).json({
            success: true,
            message: "Boarding points updated successfully by admin!",
            data: updatedBoardingPoint,
        });
    } catch (error) {
        console.error("updateBoardingPointByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Delete Boarding Point by Admin
const deleteBoardingPointByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        await boardingPointService.deleteBoardingPoint(id, null);

        return res.status(200).json({
            success: true,
            message: "Boarding point deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteBoardingPointByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get Single Boarding Point Details
const getBoardingPointById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Boarding Point ID is required.",
            });
        }

        const boardingPoint = await boardingPointService.getBoardingPointById(id, null);

        return res.status(200).json({
            success: true,
            message: "Boarding point fetched successfully!",
            data: boardingPoint,
        });
    } catch (error) {
        console.error("getBoardingPointById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createBoardingPointForOwner,
    getBoardingPointsByOwner,
    updateBoardingPointByAdmin,
    deleteBoardingPointByAdmin,
    getBoardingPointById,
};

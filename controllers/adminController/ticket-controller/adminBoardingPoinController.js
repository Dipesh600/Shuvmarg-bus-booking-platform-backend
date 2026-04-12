const mongoose = require("mongoose");
const BoardingPoints = require("../../../models/boardingPointsModel");

// Create Boarding Point
const createBoardingPoint = async (req, res) => {
    try {
        const { userId, city, description, boardingPoints } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "UserId is required",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid UserId",
            });
        }

        if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least one boarding point",
            });
        }

        const isValid = boardingPoints.every(p => p.pointName && p.time);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Each boarding point must have a pointName and time",
            });
        }

        const newBoardingPoint = await BoardingPoints.create({
            userId,
            city,
            description,
            boardingPoints,
        });

        return res.status(201).json({
            success: true,
            message: "Boarding points created successfully",
            data: newBoardingPoint,
        });
    } catch (error) {
        console.error("createBoardingPoint error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get All Boarding Points
const getAllBoardingPoints = async (req, res) => {
    try {
        const result = await BoardingPoints.find().sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            message: "Boarding points fetched successfully",
            results: result.length,
            data: result,
        });
    } catch (error) {
        console.error("getAllBoardingPoints error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get Boarding Point By ID
const getBoardingPointById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }

        const result = await BoardingPoints.findById(id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "Boarding point not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Boarding point fetched successfully",
            data: result,
        });
    } catch (error) {
        console.error("getBoardingPointById error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Update Boarding Point
const updateBoardingPoint = async (req, res) => {
    try {
        const { id } = req.params;
        const { city, description, boardingPoints } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }

        const updatedDoc = await BoardingPoints.findByIdAndUpdate(
            id,
            { city, description, boardingPoints },
            { new: true, runValidators: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({
                success: false,
                message: "Boarding point not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Boarding points updated successfully",
            data: updatedDoc,
        });
    } catch (error) {
        console.error("updateBoardingPoint error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Delete Boarding Point
const deleteBoardingPoint = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }

        const deletedDoc = await BoardingPoints.findByIdAndDelete(id);

        if (!deletedDoc) {
            return res.status(404).json({
                success: false,
                message: "Boarding point not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Boarding point deleted successfully",
            deletedData: deletedDoc,
        });
    } catch (error) {
        console.error("deleteBoardingPoint error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Toggle Boarding Point Status
const toggleBoardingPointStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }

        const doc = await BoardingPoints.findById(id);

        if (!doc) {
            return res.status(404).json({
                success: false,
                message: "Boarding point not found",
            });
        }

        doc.status = !doc.status;
        await doc.save();

        return res.status(200).json({
            success: true,
            message: `Boarding points ${doc.status ? "activated" : "deactivated"} successfully`,
            data: doc,
        });
    } catch (error) {
        console.error("toggleBoardingPointStatus error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

module.exports = {
    createBoardingPoint,
    getAllBoardingPoints,
    getBoardingPointById,
    updateBoardingPoint,
    deleteBoardingPoint,
    toggleBoardingPointStatus,
};

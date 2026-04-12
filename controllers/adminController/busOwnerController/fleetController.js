const User = require("../../../models/userModel.js");
const fleetService = require("../../../services/fleetService.js");

// Create Fleet for Owner by Admin
const createFleetForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        // Verify Owner exists
        const owner = await User.findById(ownerId);
        if (!owner) {
            return res.status(404).json({
                success: false,
                message: "Bus owner not found.",
            });
        }

        const fleetDoc = await fleetService.createFleet(ownerId, req.body, req.files, "ADMIN");

        return res.status(201).json({
            success: true,
            message: "Fleet created successfully by admin!",
            data: fleetDoc,
        });
    } catch (error) {
        console.error("createFleetForOwner error:", error);
        return res.status(error.message.includes("exists") ? 409 : 400).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Fleets for a specific Owner
const getFleetsByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const fleets = await fleetService.getFleetsByOwnerId(ownerId);

        return res.status(200).json({
            success: true,
            message: "Fleets fetched successfully for the owner!",
            results: fleets.length,
            data: fleets,
        });
    } catch (error) {
        console.error("getFleetsByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get Single Fleet Details (Admin)
const getFleetById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const fleet = await fleetService.getFleetDetails(id, null); // Admins can view any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet fetched successfully!",
            data: fleet,
        });
    } catch (error) {
        console.error("getFleetById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Update Fleet by Admin
const updateFleetByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        const updatedFleet = await fleetService.updateFleetDetails(id, req.body, req.files, null); // Admins can edit any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet updated successfully by admin!",
            data: updatedFleet,
        });
    } catch (error) {
        console.error("updateFleetByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : (error.message.includes("exists") ? 409 : 400);
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Delete Fleet by Admin
const deleteFleetByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Fleet ID is required.",
            });
        }

        await fleetService.removeFleet(id, null); // Admins can delete any fleet

        return res.status(200).json({
            success: true,
            message: "Fleet deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteFleetByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createFleetForOwner,
    getFleetsByOwner,
    getFleetById,
    updateFleetByAdmin,
    deleteFleetByAdmin,
};

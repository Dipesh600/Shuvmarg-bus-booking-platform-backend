const amenityService = require("../../../services/amenityService.js");

// Create Amenity for Owner by Admin
const createAmenityForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Please provide ownerId.",
            });
        }

        const newAmenity = await amenityService.createAmenity(ownerId, req.body);

        return res.status(201).json({
            success: true,
            message: "Amenities created successfully by admin!",
            data: newAmenity,
        });
    } catch (error) {
        console.error("createAmenityForOwner error:", error);
        return res.status(error.message.includes("provide") ? 400 : 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get All Amenities for a specific Owner
const getAmenitiesByOwner = async (req, res) => {
    try {
        const { ownerId } = req.params;

        if (!ownerId) {
            return res.status(400).json({
                success: false,
                message: "Owner ID is required.",
            });
        }

        const amenities = await amenityService.getAmenitiesByUserId(ownerId);

        return res.status(200).json({
            success: true,
            message: "Amenities fetched successfully for the owner!",
            results: amenities.length,
            data: amenities,
        });
    } catch (error) {
        console.error("getAmenitiesByOwner error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Update Amenity by Admin
const updateAmenityByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        const updatedAmenity = await amenityService.updateAmenity(id, null, req.body);

        return res.status(200).json({
            success: true,
            message: "Amenities updated successfully by admin!",
            data: updatedAmenity,
        });
    } catch (error) {
        console.error("updateAmenityByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 400;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Delete Amenity by Admin
const deleteAmenityByAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        await amenityService.deleteAmenity(id, null);

        return res.status(200).json({
            success: true,
            message: "Amenity deleted successfully by admin!",
        });
    } catch (error) {
        console.error("deleteAmenityByAdmin error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

// Get Single Amenity Details
const getAmenityById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Amenity ID is required.",
            });
        }

        const amenity = await amenityService.getAmenityById(id, null);

        return res.status(200).json({
            success: true,
            message: "Amenity fetched successfully!",
            data: amenity,
        });
    } catch (error) {
        console.error("getAmenityById error:", error);
        const status = error.message.includes("found") ? 404 : 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

module.exports = {
    createAmenityForOwner,
    getAmenitiesByOwner,
    updateAmenityByAdmin,
    deleteAmenityByAdmin,
    getAmenityById,
};

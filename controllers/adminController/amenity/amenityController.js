const amenityService = require("../../../services/amenityService.js");

/**
 * List all GLOBAL amenities (platform catalog — no ownerId needed)
 */
const getAllGlobalAmenities = async (req, res) => {
    try {
        const amenities = await amenityService.getAllGlobalAmenities();
        return res.status(200).json({
            success: true,
            results: amenities.length,
            data: amenities,
        });
    } catch (error) {
        console.error("getAllGlobalAmenities error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Create a new Global Amenity (Super Admin)
 */
const createGlobalAmenity = async (req, res) => {
    try {
        const newAmenity = await amenityService.createAmenity({ ...req.body, type: "GLOBAL" });
        return res.status(201).json({
            success: true,
            message: "Global amenity created successfully!",
            data: newAmenity,
        });
    } catch (error) {
        console.error("createGlobalAmenity error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

/**
 * Create a Custom Amenity for an Owner
 */
const createAmenityForOwner = async (req, res) => {
    try {
        const { ownerId } = req.body;
        const newAmenity = await amenityService.createAmenity(req.body, ownerId);
        return res.status(201).json({
            success: true,
            message: "Amenity created successfully!",
            data: newAmenity,
        });
    } catch (error) {
        console.error("createAmenityForOwner error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
        });
    }
};

/**
 * Get all available amenities for an owner (Global + Custom)
 */
const getAvailableAmenities = async (req, res) => {
    try {
        const { ownerId } = req.params;
        const amenities = await amenityService.getAmenitiesForOwner(ownerId);
        return res.status(200).json({
            success: true,
            message: "Amenities fetched successfully",
            results: amenities.length,
            data: amenities,
        });
    } catch (error) {
        console.error("getAvailableAmenities error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAmenityById = async (req, res) => {
    try {
        const amenity = await amenityService.getAmenityById(req.params.id);
        return res.status(200).json({ success: true, data: amenity });
    } catch (error) {
        return res.status(404).json({ success: false, message: error.message });
    }
};

const updateAmenity = async (req, res) => {
    try {
        const updated = await amenityService.updateAmenity(req.params.id, req.body);
        return res.status(200).json({
            success: true,
            message: "Amenity updated successfully",
            data: updated,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteAmenity = async (req, res) => {
    try {
        await amenityService.deleteAmenity(req.params.id);
        return res.status(200).json({
            success: true,
            message: "Amenity deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getAllGlobalAmenities,
    createGlobalAmenity,
    createAmenityForOwner,
    getAvailableAmenities,
    getAmenityById,
    updateAmenity,
    deleteAmenity,
};

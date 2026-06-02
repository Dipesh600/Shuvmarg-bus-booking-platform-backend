const BusAmenities = require("../models/busAmenitiesModel.js");

/**
 * Create a new Amenity (Global or Custom)
 */
const createAmenity = async (data, ownerId = null) => {
    const { name, description, icon, type } = data;

    if (!name) {
        throw new Error("Amenity name is required.");
    }

    return await BusAmenities.create({
        name,
        description,
        icon,
        type: type || (ownerId ? "CUSTOM" : "GLOBAL"),
        ownerId: ownerId,
    });
};

/**
 * Get all global amenities
 */
const getAllGlobalAmenities = async () => {
    return await BusAmenities.find({ type: "GLOBAL", status: true }).sort({ name: 1 }).lean();
};

/**
 * Get all amenities for an owner (Global + Custom)
 */
const getAmenitiesForOwner = async (ownerId) => {
    return await BusAmenities.find({
        status: true,
        $or: [
            { type: "GLOBAL" },
            { ownerId: ownerId }
        ]
    }).sort({ type: 1, name: 1 }).lean();
};

const getAmenityById = async (id) => {
    const amenity = await BusAmenities.findById(id);
    if (!amenity) {
        throw new Error("Amenity not found.");
    }
    return amenity;
};

const updateAmenity = async (id, data) => {
    return await BusAmenities.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteAmenity = async (id) => {
    return await BusAmenities.findByIdAndDelete(id);
};

module.exports = {
    createAmenity,
    getAllGlobalAmenities,
    getAmenitiesForOwner,
    getAmenityById,
    updateAmenity,
    deleteAmenity,
};

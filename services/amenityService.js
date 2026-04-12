const BusAmenities = require("../models/busAmenitiesModel.js");

const createAmenity = async (userId, data) => {
    const { amenities } = data;

    if (!amenities || !Array.isArray(amenities) || amenities.length === 0) {
        throw new Error("Please provide at least one amenity.");
    }

    // Validate amenity structure
    const isValid = amenities.every(a => a.name);
    if (!isValid) {
        throw new Error("Each amenity must have a name.");
    }

    return await BusAmenities.create({
        userId,
        amenities,
    });
};

const getAmenitiesByUserId = async (userId) => {
    return await BusAmenities.find({ userId }).sort({ createdAt: -1 }).lean();
};

const getAmenityById = async (id, userId = null) => {
    const query = { _id: id };
    if (userId) query.userId = userId;

    const amenity = await BusAmenities.findOne(query);
    if (!amenity) {
        throw new Error("Amenity not found.");
    }
    return amenity;
};

const updateAmenity = async (id, userId = null, data) => {
    const { amenities, status } = data;

    const query = { _id: id };
    if (userId) query.userId = userId;

    const existingAmenity = await BusAmenities.findOne(query);
    if (!existingAmenity) {
        throw new Error("Amenity not found or unauthorized.");
    }

    if (amenities) {
        if (!Array.isArray(amenities) || amenities.length === 0) {
            throw new Error("Please provide at least one amenity.");
        }
        const isValid = amenities.every(a => a.name);
        if (!isValid) {
            throw new Error("Each amenity must have a name.");
        }
    }

    return await BusAmenities.findByIdAndUpdate(
        id,
        {
            amenities: amenities !== undefined ? amenities : existingAmenity.amenities,
            status: status !== undefined ? status : existingAmenity.status,
        },
        { new: true, runValidators: true }
    );
};

const deleteAmenity = async (id, userId = null) => {
    const query = { _id: id };
    if (userId) query.userId = userId;

    const deletedAmenity = await BusAmenities.findOneAndDelete(query);
    if (!deletedAmenity) {
        throw new Error("Amenity not found or unauthorized.");
    }
    return deletedAmenity;
};

module.exports = {
    createAmenity,
    getAmenitiesByUserId,
    getAmenityById,
    updateAmenity,
    deleteAmenity,
};

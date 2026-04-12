const Amenities = require("../../../models/busAmenitiesModel");

// Create Amenity
// Create Amenity (Supports Single or Multiple)
const mongoose = require("mongoose");

const createAmenity = async (req, res) => {
    try {
        const { userId, amenities } = req.body;

        // Admin must pass userId
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "UserId is required",
            });
        }

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid UserId",
            });
        }

        // Validate amenities
        if (!Array.isArray(amenities) || amenities.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide at least one amenity",
            });
        }

        const isValid = amenities.every(a => a.name);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Each amenity must have a name",
            });
        }

        // ✅ ALWAYS CREATE NEW DOCUMENT
        const newAmenity = await BusAmenities.create({
            userId,
            amenities,
        });

        return res.status(201).json({
            success: true,
            message: "Amenities created successfully",
            data: newAmenity,
        });
    } catch (error) {
        console.error("createAmenity error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

module.exports = { createAmenity };



// Get All Amenities
const getAllAmenities = async (req, res) => {
    try {
        const amenities = await Amenities.find();
        return res.status(200).json({
            status: true,
            message: "Amenities fetched successfully!",
            results: amenities.length,
            data: amenities,
        });
    } catch (error) {
        console.error("Error fetching amenities:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
            error: error.message,
        });
    }
};

// Get Amenity by ID
const getAmenityById = async (req, res) => {
    try {
        const { id } = req.params;
        const amenity = await Amenities.findById(id);

        if (!amenity) {
            return res.status(404).json({
                status: false,
                message: "Amenity not found!",
            });
        }

        return res.status(200).json({
            status: true,
            message: "Amenity fetched successfully!",
            data: amenity,
        });
    } catch (error) {
        console.error("Error fetching amenity by ID:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
            error: error.message,
        });
    }
};

// Get Amenities by User ID (Moved from TicketController)
const getAmenitiesByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        const amenities = await Amenities.find({ userId });

        return res.status(200).json({
            status: true,
            message: "Amenities fetched successfully!",
            results: amenities.length,
            data: amenities,
        });
    } catch (error) {
        console.error("Error fetching amenities by user ID:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
            error: error.message,
        });
    }
};

// Update Amenity
const bulkUpdateAmenities = async (req, res) => {
    try {
        const { userId, updates } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                status: false,
                message: "Invalid userId",
            });
        }

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                status: false,
                message: "Updates array is required",
            });
        }

        const bulkOps = updates.map(item => {
            if (!mongoose.Types.ObjectId.isValid(item.amenityId)) return null;

            const setFields = {};
            if (item.name) setFields["amenities.$.name"] = item.name;
            if (item.description) setFields["amenities.$.description"] = item.description;
            if (item.icon) setFields["amenities.$.icon"] = item.icon;

            return {
                updateOne: {
                    filter: {
                        userId,
                        "amenities._id": item.amenityId,
                    },
                    update: { $set: setFields },
                },
            };
        }).filter(Boolean);

        if (bulkOps.length === 0) {
            return res.status(400).json({
                status: false,
                message: "No valid updates provided",
            });
        }

        const result = await Amenities.bulkWrite(bulkOps);

        return res.status(200).json({
            status: true,
            message: "Amenities updated successfully",
            result,
        });
    } catch (error) {
        console.error("bulkUpdateAmenities error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};


// Delete Amenity
const deleteAmenity = async (req, res) => {
    try {
        const { userId, amenityId } = req.params;

        // Validate ObjectIds
        if (
            !mongoose.Types.ObjectId.isValid(userId) ||
            !mongoose.Types.ObjectId.isValid(amenityId)
        ) {
            return res.status(400).json({
                status: false,
                message: "Invalid userId or amenityId",
            });
        }

        // Delete the entire amenities document
        const deletedDoc = await Amenities.findOneAndDelete({
            _id: amenityId,
            userId: userId
        });

        if (!deletedDoc) {
            return res.status(404).json({
                status: false,
                message: "Amenity document not found for this user",
            });
        }

        return res.status(200).json({
            status: true,
            message: "Amenity document deleted successfully",
            deletedData: deletedDoc
        });
    } catch (error) {
        console.error("deleteAmenity error:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Toggle Amenity Status
const toggleAmenityStatus = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                status: false,
                message: "Invalid amenity ID",
            });
        }

        // Find the document
        const doc = await Amenities.findById(id);

        if (!doc) {
            return res.status(404).json({
                status: false,
                message: "Amenity document not found!",
            });
        }

        // Toggle the status for entire document
        doc.status = !doc.status;
        await doc.save();

        return res.status(200).json({
            status: true,
            message: `amenities ${doc.status ? "Activated" : "Deactivated"} successfully!`,
            data: {
                _id: doc._id,
                userId: doc.userId,
                status: doc.status,
                amenitiesCount: doc.amenities.length,
                amenities: doc.amenities,
                updatedAt: doc.updatedAt
            },
        });
    } catch (error) {
        console.error("Error toggling amenity status:", error);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error!",
            error: error.message,
        });
    }
};

module.exports = {
    createAmenity,
    getAllAmenities,
    getAmenityById,
    getAmenitiesByUserId,
    bulkUpdateAmenities,
    deleteAmenity,
    toggleAmenityStatus,
};

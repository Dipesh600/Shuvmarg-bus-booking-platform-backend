const BoardingPoints = require("../models/boardingPointsModel.js");

/**
 * Create a new Boarding/Dropping point (Global or Custom)
 */
const createBoardingPoint = async (data, ownerId = null) => {
    const { city, pointName, landmark, coordinates, contactNumber, type, isGlobal } = data;

    if (!city || !pointName) {
        throw new Error("City and Point Name are required.");
    }

    return await BoardingPoints.create({
        city,
        pointName,
        landmark,
        coordinates,
        contactNumber,
        type: type || "BOTH",
        isGlobal: isGlobal !== undefined ? isGlobal : (ownerId ? false : true),
        ownerId: ownerId,
    });
};

/**
 * Get all global points for a city
 */
const getGlobalPointsByCity = async (city, type = null) => {
    const query = { city, isGlobal: true, status: true };
    if (type && type !== "BOTH") {
        query.$or = [{ type: type }, { type: "BOTH" }];
    }
    return await BoardingPoints.find(query).sort({ pointName: 1 }).lean();
};

/**
 * Get all points (Global + Owner's Custom) for an owner in a city
 */
const getPointsForOwner = async (city, ownerId, type = null) => {
    const query = { 
        city, 
        status: true,
        $or: [
            { isGlobal: true },
            { ownerId: ownerId }
        ]
    };
    if (type && type !== "BOTH") {
        query.type = { $in: [type, "BOTH"] };
    }
    return await BoardingPoints.find(query).sort({ isGlobal: -1, pointName: 1 }).lean();
};

const getBoardingPointById = async (id) => {
    const point = await BoardingPoints.findById(id);
    if (!point) {
        throw new Error("Point not found.");
    }
    return point;
};

const updateBoardingPoint = async (id, data) => {
    return await BoardingPoints.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteBoardingPoint = async (id) => {
    return await BoardingPoints.findByIdAndDelete(id);
};

/**
 * Get all custom boarding points created by a specific owner (across all cities)
 */
const getBoardingPointsByOwner = async (ownerId) => {
    return await BoardingPoints.find({ ownerId, isGlobal: false })
        .sort({ city: 1, pointName: 1 })
        .lean();
};

module.exports = {
    createBoardingPoint,
    getGlobalPointsByCity,
    getPointsForOwner,
    getBoardingPointsByOwner,
    getBoardingPointById,
    updateBoardingPoint,
    deleteBoardingPoint,
};

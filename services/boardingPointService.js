const BoardingPoints = require("../models/boardingPointsModel.js");

const createBoardingPoints = async (userId, data) => {
    const { city, boardingPoints, description } = data;

    if (!city || !boardingPoints || !Array.isArray(boardingPoints) || boardingPoints.length === 0) {
        throw new Error("Please provide city and at least one boarding point.");
    }

    // Validate each boarding point structure
    const isValidPoints = boardingPoints.every(pt => pt.pointName && pt.time);
    if (!isValidPoints) {
        throw new Error("Each boarding point must have a pointName and time.");
    }

    return await BoardingPoints.create({
        userId,
        city,
        boardingPoints,
        description,
    });
};

const getBoardingPointsByUserId = async (userId) => {
    return await BoardingPoints.find({ userId }).sort({ createdAt: -1 }).lean();
};

const getBoardingPointById = async (id, userId = null) => {
    const query = { _id: id };
    if (userId) query.userId = userId;

    const boardingPoint = await BoardingPoints.findOne(query);
    if (!boardingPoint) {
        throw new Error("Boarding point not found.");
    }
    return boardingPoint;
};

const updateBoardingPoints = async (id, userId = null, data) => {
    const { city, boardingPoints, description, status } = data;

    const query = { _id: id };
    if (userId) query.userId = userId;

    const existingBoardingPoint = await BoardingPoints.findOne(query);
    if (!existingBoardingPoint) {
        throw new Error("Boarding point not found or unauthorized.");
    }

    if (boardingPoints) {
        if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
            throw new Error("Please provide at least one boarding point.");
        }
        const isValidPoints = boardingPoints.every(pt => pt.pointName && pt.time);
        if (!isValidPoints) {
            throw new Error("Each boarding point must have a pointName and time.");
        }
    }

    return await BoardingPoints.findByIdAndUpdate(
        id,
        {
            city: city !== undefined ? city : existingBoardingPoint.city,
            boardingPoints: boardingPoints !== undefined ? boardingPoints : existingBoardingPoint.boardingPoints,
            description: description !== undefined ? description : existingBoardingPoint.description,
            status: status !== undefined ? status : existingBoardingPoint.status,
        },
        { new: true, runValidators: true }
    );
};

const deleteBoardingPoint = async (id, userId = null) => {
    const query = { _id: id };
    if (userId) query.userId = userId;

    const deletedBoardingPoint = await BoardingPoints.findOneAndDelete(query);
    if (!deletedBoardingPoint) {
        throw new Error("Boarding point not found or unauthorized.");
    }
    return deletedBoardingPoint;
};

module.exports = {
    createBoardingPoints,
    getBoardingPointsByUserId,
    getBoardingPointById,
    updateBoardingPoints,
    deleteBoardingPoint,
};

const Bus = require("../models/fleetModel.js");
const BusAmenities = require("../models/busAmenitiesModel.js");
const BoardingPoints = require("../models/boardingPointsModel.js");
const cloudinary = require("../handlers/cloudinary.js");

const uploadToCloudinary = async (file, folder) => {
    const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
        folder,
        overwrite: true,
    });
    return result.secure_url;
};

const uploadManyToCloudinary = async (files, folder) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const urls = [];
    for (const file of fileArray) {
        const url = await uploadToCloudinary(file, folder);
        urls.push(url);
    }
    return urls;
};

const createFleet = async (ownerId, fleetData, files, createdBy = "BUS_OWNER") => {
    const {
        busName,
        busNumber,
        busType,
        totalSeats,
        seatLayout,
        amenitiesId,
        boardingPointId,
        registrationYear,
        status,
        vehicleType,
    } = fleetData;

    // Validate required fields
    if (!busName || !busNumber || !busType || !totalSeats || !seatLayout || !vehicleType) {
        throw new Error("Missing required fleet fields.");
    }

    // Bus Number uniqueness check
    const normalizedBusNumber = String(busNumber).trim().toUpperCase();
    const existingBus = await Bus.findOne({ busNumber: normalizedBusNumber });
    if (existingBus) {
        throw new Error("Bus number already exists!");
    }

    // Validate amenitiesId if provided
    if (amenitiesId) {
        const amenitiesExist = await BusAmenities.findById(amenitiesId);
        if (!amenitiesExist) {
            throw new Error("Invalid amenitiesId provided.");
        }
    }

    // Validate boardingPointId if provided
    if (boardingPointId) {
        const boardingPointExist = await BoardingPoints.findById(boardingPointId);
        if (!boardingPointExist) {
            throw new Error("Invalid boardingPointId provided.");
        }
    }

    // Handle image uploads
    let fleetImages = [];
    if (files?.fleetImages || files?.busImage) {
        fleetImages = await uploadManyToCloudinary(
            files.fleetImages || files.busImage,
            `fleet/${ownerId}`
        );
    }

    // Determine approval status
    const approvalStatus = createdBy === "ADMIN" ? "APPROVED" : "PENDING";
    const approvedAt = createdBy === "ADMIN" ? new Date() : null;

    // Create the document
    return await Bus.create({
        ownerId,
        busName,
        busNumber: normalizedBusNumber,
        busType,
        totalSeats,
        seatLayout,
        amenitiesId: amenitiesId || null,
        boardingPointId: boardingPointId || null,
        fleetImages,
        registrationYear: registrationYear || null,
        status: status || "ACTIVE",
        approvalStatus,
        approvedAt,
        createdBy,
        vehicleType,
    });
};

const getFleetsByOwnerId = async (ownerId) => {
    return await Bus.find({ ownerId })
        .populate("ownerId", "name email phone")
        .populate("amenitiesId")
        .populate("boardingPointId")
        .sort({ createdAt: -1 })
        .lean();
};

const getFleetDetails = async (fleetId, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query)
        .populate("ownerId", "name email phone")
        .populate("amenitiesId")
        .populate("boardingPointId");
    
    if (!fleet) {
        throw new Error("Fleet not found or unauthorized.");
    }
    return fleet;
};

const updateFleetDetails = async (fleetId, updateData, files, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const fleet = await Bus.findOne(query);
    if (!fleet) {
        throw new Error("Fleet not found or unauthorized.");
    }

    // Handle new images if any
    if (files?.fleetImages || files?.busImage) {
        const newImages = await uploadManyToCloudinary(
            files.fleetImages || files.busImage,
            `fleet/${fleet.ownerId || 'unknown'}`
        );
        updateData.fleetImages = [...(fleet.fleetImages || []), ...newImages];
    }

    // For busNumber, ensure uniqueness if changed
    if (updateData.busNumber) {
        const normalizedBusNumber = String(updateData.busNumber).trim().toUpperCase();
        if (normalizedBusNumber !== fleet.busNumber) {
            const existingBus = await Bus.findOne({ busNumber: normalizedBusNumber });
            if (existingBus) {
                throw new Error("New bus number already exists!");
            }
            updateData.busNumber = normalizedBusNumber;
        }
    }

    return await Bus.findByIdAndUpdate(
        fleetId,
        { ...updateData },
        { new: true, runValidators: true }
    );
};

const removeFleet = async (fleetId, ownerId = null) => {
    const query = { _id: fleetId };
    if (ownerId) query.ownerId = ownerId;

    const deletedFleet = await Bus.findOneAndDelete(query);
    if (!deletedFleet) {
        throw new Error("Fleet not found or unauthorized.");
    }
    return deletedFleet;
};

module.exports = {
    createFleet,
    getFleetsByOwnerId,
    getFleetDetails,
    updateFleetDetails,
    removeFleet,
};

const BusOwner = require("../models/busOwnerModel.js");
const Bus = require("../models/fleetModel.js");
const Route = require("../models/busRouteModel.js");
const Trip = require("../models/tripModel.js");
const seatTemplate = require('../models/seatTemplateModel.js');
const Seat = require("../models/seatsModel.js");

// Helper to check verification
const checkBusOwnerVerification = async (userId) => {
    const busOwner = await BusOwner.findOne({ user: userId });
    return busOwner && busOwner.verificationStatus === "approved";
};

const createTrip = async (ownerId, tripData, role = "OWNER") => {
    const {
        busId,
        routeId,
        seatTemplateId,
        tripDate,
        departureTime,
        arrivalTime,
        shift,
        tripFare,
        recurrence,
        daysOfWeek,
        autoGenerateUntil,
        isActive
    } = tripData;

    // Explicit Validation
    if (!busId) throw new Error("Bus ID is required.");
    if (!routeId) throw new Error("Route ID is required.");
    if (!seatTemplateId) throw new Error("Seat Template ID is required.");
    if (!tripDate) throw new Error("Trip Date is required.");
    if (!departureTime) throw new Error("Departure Time is required.");
    if (!arrivalTime) throw new Error("Arrival Time is required.");
    if (!shift) throw new Error("Shift (day/night) is required.");

    // Bus owners must be verified
    if (role === "OWNER") {
        const isVerified = await checkBusOwnerVerification(ownerId);
        if (!isVerified) {
            throw new Error("Please first verify your account to create trips.");
        }
    }

    // Validate Bus belongs to owner
    const bus = await Bus.findOne({ _id: busId, ownerId });
    if (!bus) {
        throw new Error("Bus not found or unauthorized for this owner.");
    }

    // Validate Route
    const route = await Route.findById(routeId);
    if (!route) {
        throw new Error("Route not found.");
    }

    // Validate Seat template
    const template = await seatTemplate.findById(seatTemplateId);
    if (!template) {
        throw new Error("Seat template not found.");
    }

    // Generate a unique tripId
    const tripId = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newTrip = await Trip.create({
        tripId,
        busId,
        routeId,
        seatTemplateId,
        ownerId,
        tripDate,
        departureTime,
        arrivalTime,
        shift,
        tripFare: tripFare || null,
        recurrence: recurrence || "none",
        daysOfWeek: daysOfWeek || [],
        autoGenerateUntil: autoGenerateUntil || null,
        isActive: isActive !== undefined ? isActive : true,
        status: "scheduled"
    });

    // Initialize seats for this specific trip using the layout from the template
    const tripSeats = await Seat.create({
        tripId: newTrip._id,
        seata: template.seata.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatb: template.seatb.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatc: template.seatc.map(s => ({ seatNo: s.seatNo, booked: false }))
    });

    return { trip: newTrip, seats: tripSeats };
};

const getTripsByOwnerId = async (ownerId) => {
    return await Trip.find({ ownerId })
        .populate("busId", "busName busNumber")
        .populate("routeId", "routeName fromCity toCity distance basePrice")
        .sort({ departureTime: 1 });
};

const getTripDetails = async (tripId, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    const trip = await Trip.findOne(query)
        .populate("busId")
        .populate("routeId");

    if (!trip) {
        throw new Error("Trip not found or unauthorized.");
    }
    return trip;
};

const updateTripDetails = async (tripId, updateData, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    const trip = await Trip.findOneAndUpdate(query, updateData, { new: true });
    if (!trip) {
        throw new Error("Trip not found or unauthorized.");
    }
    return trip;
};

const removeTrip = async (tripId, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    const deletedTrip = await Trip.findOneAndDelete(query);
    if (!deletedTrip) {
        throw new Error("Trip not found or unauthorized.");
    }

    // Also delete associated seats
    await Seat.deleteMany({ tripId: deletedTrip._id });

    return deletedTrip;
};

module.exports = {
    createTrip,
    getTripsByOwnerId,
    getTripDetails,
    updateTripDetails,
    removeTrip,
};

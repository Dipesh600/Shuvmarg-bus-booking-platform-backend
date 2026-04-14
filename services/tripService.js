const BusOwner      = require("../models/busOwnerModel.js");
const Bus           = require("../models/fleetModel.js");
const Route         = require("../models/busRouteModel.js");
const Trip          = require("../models/tripModel.js");
const SeatTemplate  = require('../models/seatTemplateModel.js');
const Seat          = require("../models/seatsModel.js");
const logger        = require("../utils/logger.js");

// ---------------------------------------------------------------------------
// Trip Status State Machine
// Industry-standard lifecycle: scheduled → boarding → in_transit → completed
// cancelled can only be set from scheduled or boarding (never mid-transit)
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS = {
    scheduled:  ["boarding", "cancelled"],
    boarding:   ["in_transit", "cancelled"],
    "in_transit": ["completed"],
    completed:  [],   // terminal state
    cancelled:  [],   // terminal state
};

const validateStatusTransition = (currentStatus, newStatus) => {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
        throw new Error(
            `Invalid status transition: "${currentStatus}" → "${newStatus}". ` +
            `Allowed next states: [${allowed.join(", ") || "none — terminal state"}]`
        );
    }
};

// ---------------------------------------------------------------------------
// Helper: check bus owner KYC approval
// ---------------------------------------------------------------------------
const checkBusOwnerVerification = async (userId) => {
    const busOwner = await BusOwner.findOne({ user: userId });
    return busOwner && busOwner.verificationStatus === "approved";
};

// ---------------------------------------------------------------------------
// createTrip
// ---------------------------------------------------------------------------
const createTrip = async (ownerId, tripData, role = "OWNER") => {
    const {
        busId, routeId, seatTemplateId, tripDate,
        departureTime, arrivalTime, shift, tripFare,
        recurrence, daysOfWeek, autoGenerateUntil, isActive,
    } = tripData;

    if (!busId)           throw new Error("Bus ID is required.");
    if (!routeId)         throw new Error("Route ID is required.");
    if (!seatTemplateId)  throw new Error("Seat Template ID is required.");
    if (!tripDate)        throw new Error("Trip Date is required.");
    if (!departureTime)   throw new Error("Departure Time is required.");
    if (!arrivalTime)     throw new Error("Arrival Time is required.");
    if (!shift)           throw new Error("Shift (day/night) is required.");

    if (role === "OWNER") {
        const isVerified = await checkBusOwnerVerification(ownerId);
        if (!isVerified) throw new Error("Please verify your account before creating trips.");
    }

    const bus = await Bus.findOne({ _id: busId, ownerId });
    if (!bus)  throw new Error("Bus not found or not owned by this account.");

    const route = await Route.findById(routeId);
    if (!route) throw new Error("Route not found.");

    const template = await SeatTemplate.findById(seatTemplateId);
    if (!template) throw new Error("Seat template not found.");

    const tripId = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newTrip = await Trip.create({
        tripId,
        busId, routeId, seatTemplateId, ownerId,
        tripDate,
        departureTime, arrivalTime, shift,
        tripFare:         tripFare        || null,
        recurrence:       recurrence      || "none",
        daysOfWeek:       daysOfWeek      || [],
        autoGenerateUntil: autoGenerateUntil || null,
        isActive:         isActive !== undefined ? isActive : true,
        status:           "scheduled",
    });

    const tripSeats = await Seat.create({
        tripId: newTrip._id,
        seata:  template.seata.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatb:  template.seatb.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatc:  (template.seatc || []).map(s => ({ seatNo: s.seatNo, booked: false })),
    });

    logger.info("tripService: trip created", { tripId: newTrip.tripId, ownerId });
    return { trip: newTrip, seats: tripSeats };
};

// ---------------------------------------------------------------------------
// getTripsByOwnerId
// ---------------------------------------------------------------------------
const getTripsByOwnerId = async (ownerId) => {
    return await Trip.find({ ownerId })
        .populate("busId",   "busName busNumber")
        .populate("routeId", "routeName fromCity toCity distance basePrice")
        .sort({ tripDate: -1, departureTime: 1 });
};

// ---------------------------------------------------------------------------
// getTripDetails
// ---------------------------------------------------------------------------
const getTripDetails = async (tripId, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    const trip = await Trip.findOne(query)
        .populate("busId")
        .populate("routeId");

    if (!trip) throw new Error("Trip not found or unauthorized.");
    return trip;
};

// ---------------------------------------------------------------------------
// updateTripDetails — enforces state machine when status changes
// ---------------------------------------------------------------------------
const updateTripDetails = async (tripId, updateData, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    // Fetch current trip to validate any status transition
    if (updateData.status) {
        const current = await Trip.findOne(query).select("status").lean();
        if (!current) throw new Error("Trip not found or unauthorized.");

        // Enforce the state machine — throws if transition is invalid
        validateStatusTransition(current.status, updateData.status);

        logger.info("tripService: status transition", {
            tripId,
            from: current.status,
            to:   updateData.status,
        });
    }

    const trip = await Trip.findOneAndUpdate(query, updateData, { new: true });
    if (!trip) throw new Error("Trip not found or unauthorized.");
    return trip;
};

// ---------------------------------------------------------------------------
// removeTrip — also cleans up associated seats
// Cannot delete a trip that is in_transit or completed
// ---------------------------------------------------------------------------
const removeTrip = async (tripId, ownerId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;

    const trip = await Trip.findOne(query).lean();
    if (!trip) throw new Error("Trip not found or unauthorized.");

    if (["in_transit", "completed"].includes(trip.status)) {
        throw new Error(`Cannot delete a trip with status "${trip.status}". Cancel it first.`);
    }

    await Trip.findOneAndDelete(query);
    await Seat.deleteMany({ tripId: trip._id });

    logger.info("tripService: trip deleted", { tripId, status: trip.status });
    return trip;
};

module.exports = {
    createTrip,
    getTripsByOwnerId,
    getTripDetails,
    updateTripDetails,
    removeTrip,
    validateStatusTransition,  // exported for testing
};

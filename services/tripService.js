const BusOwner         = require("../models/busOwnerModel.js");
const Bus              = require("../models/fleetModel.js");
const Route            = require("../models/busRouteModel.js");
const RouteVariant     = require("../models/routeVariantModel.js");
const OperatorRouteConfig = require("../models/operatorRouteConfigModel.js");
const Trip             = require("../models/tripModel.js");
const SeatTemplate     = require('../models/seatTemplateModel.js');
const Seat             = require("../models/seatsModel.js");
const User             = require("../models/userModel.js");
const DriverProfile    = require("../models/driverProfileModel.js");
const logger           = require("../utils/logger.js");

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
// createTrip — supports BOTH legacy routeId and new variantId paths
// ---------------------------------------------------------------------------
const createTrip = async (ownerId, tripData, role = "OWNER") => {
    const {
        busId, routeId, variantId, seatTemplateId, tripDate,
        departureTime, arrivalTime, shift, tripFare,
        recurrence, daysOfWeek, autoGenerateUntil, isActive,
    } = tripData;

    if (!busId)          throw new Error("Bus ID is required.");
    if (!routeId && !variantId) {
        throw new Error("Either routeId (legacy) or variantId (platform registry) is required.");
    }
    if (!tripDate)       throw new Error("Trip Date is required.");
    if (!departureTime)  throw new Error("Departure Time is required.");
    if (!arrivalTime)    throw new Error("Arrival Time is required.");
    if (!shift)          throw new Error("Shift (day/night) is required.");

    if (role === "OWNER") {
        const isVerified = await checkBusOwnerVerification(ownerId);
        if (!isVerified) throw new Error("Please verify your account before creating trips.");
    }

    // ── FLEET INTEGRITY GUARDS ────────────────────────────────────────────────────
    const bus = await Bus.findOne({ _id: busId, ownerId });
    if (!bus) throw new Error("Bus not found or not owned by this account.");

    if (bus.approvalStatus !== "APPROVED") {
        throw new Error(
            `Fleet "${bus.busName} (${bus.busNumber})" is not yet approved ` +
            `(current status: ${bus.approvalStatus}). ` +
            `Trips can only be created for approved vehicles.`
        );
    }
    if (bus.status === "INACTIVE" || bus.status === "MAINTENANCE") {
        throw new Error(
            `Fleet "${bus.busName} (${bus.busNumber})" is currently ${bus.status}. ` +
            `Set the vehicle to ACTIVE before scheduling trips.`
        );
    }

    // brandId is authoritative from the fleet — cannot be spoofed by caller
    const brandId = bus.brandId || null;

    // ── ROUTE RESOLUTION ────────────────────────────────────────────────────────
    // Path A (NEW): variantId provided → validate via OperatorRouteConfig
    // Path B (LEGACY): routeId provided → validate via BusRoute model
    let resolvedRouteId   = routeId || null;
    let resolvedVariantId = variantId || null;

    if (variantId) {
        // Validate the variant exists
        const variant = await RouteVariant.findById(variantId).select("_id status").lean();
        if (!variant) throw new Error("Route variant not found.");
        if (variant.status !== "ACTIVE") {
            throw new Error(`Route variant is not ACTIVE (status: ${variant.status}).`);
        }

        // Validate brand has configured their service on this variant
        if (brandId) {
            const config = await OperatorRouteConfig.findOne({
                brandId,
                variantId,
                status: "ACTIVE",
            }).select("_id").lean();
            if (!config) {
                throw new Error(
                    `This brand has no ACTIVE route configuration for this variant. ` +
                    `Configure the route service first under Route Services.`
                );
            }
        }
    } else {
        // Legacy path: validate via BusRoute
        const route = await Route.findById(routeId);
        if (!route) throw new Error("Route not found.");
    }

    // ── SEAT GENERATION (V2 COMPATIBILITY) ──────────────────────────────────────
    let seata = [];
    let seatb = [];
    let seatc = [];

    if (seatTemplateId) {
        const template = await SeatTemplate.findById(seatTemplateId);
        if (template) {
            seata = template.seata || [];
            seatb = template.seatb || [];
            seatc = template.seatc || [];
        }
    } 
    
    // Fallback to reading the new V2 seatConfig embedded directly in the bus
    if (seata.length === 0 && seatb.length === 0 && bus.seatConfig && bus.seatConfig.floors) {
        bus.seatConfig.floors.forEach(floor => {
            if (!floor.rows) return;
            floor.rows.forEach(row => {
                if (!row.cells) return;
                row.cells.forEach(cell => {
                    if (cell.cellType === "SEAT" && cell.seatLabel) {
                        // Rough heuristic to split V2 cells into V1 columns for the trip viewer
                        if (cell.colIndex <= 1) {
                            seata.push({ seatNo: cell.seatLabel, booked: false });
                        } else if (cell.colIndex >= 3) {
                            seatb.push({ seatNo: cell.seatLabel, booked: false });
                        } else {
                            seatc.push({ seatNo: cell.seatLabel, booked: false });
                        }
                    }
                });
            });
        });
    }

    if (seata.length === 0 && seatb.length === 0 && seatc.length === 0) {
        throw new Error("Could not determine seat layout for this bus. Check fleet configuration.");
    }

    const tripId = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newTrip = await Trip.create({
        tripId,
        busId,
        routeId:   resolvedRouteId,
        variantId: resolvedVariantId,
        seatTemplateId: seatTemplateId || null,
        ownerId,
        brandId,          // propagated from the fleet
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
        seata:  seata.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatb:  seatb.map(s => ({ seatNo: s.seatNo, booked: false })),
        seatc:  seatc.map(s => ({ seatNo: s.seatNo, booked: false })),
    });

    logger.info("tripService: trip created", {
        tripId:    newTrip.tripId,
        ownerId,
        brandId,
        path:      variantId ? "NEW_REGISTRY" : "LEGACY_ROUTE",
    });
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
        const current = await Trip.findOne(query).select("status driverId").lean();
        if (!current) throw new Error("Trip not found or unauthorized.");

        // Enforce the state machine — throws if transition is invalid
        validateStatusTransition(current.status, updateData.status);

        // ── DRIVER GATE ──────────────────────────────────────────────────────
        // A trip cannot move to 'boarding' without an APPROVED DriverProfile.
        // We actively query the DriverProfile to prevent a suspended/rejected
        // driver from boarding a bus — a truthy field check alone is not enough.
        if (updateData.status === "boarding") {
            const assignedDriverId = current.driverId || updateData.driverId;
            if (!assignedDriverId) {
                throw new Error(
                    "Cannot move trip to BOARDING: no driver is assigned. " +
                    "Assign an approved driver first via PATCH /trips/:id/assign-driver."
                );
            }
            const dp = await DriverProfile.findById(assignedDriverId)
                .select("approvalStatus status fullName licenseExpiry")
                .lean();
            if (!dp) {
                throw new Error(
                    "Cannot move trip to BOARDING: assigned driver record not found. Re-assign a valid driver."
                );
            }
            if (dp.approvalStatus !== "APPROVED") {
                throw new Error(
                    `Cannot move trip to BOARDING: driver "${dp.fullName}" is not APPROVED ` +
                    `(current: ${dp.approvalStatus}). Admin must approve the driver first.`
                );
            }
            if (dp.status === "SUSPENDED") {
                throw new Error(
                    `Cannot move trip to BOARDING: driver "${dp.fullName}" is SUSPENDED.`
                );
            }
            if (dp.licenseExpiry && new Date(dp.licenseExpiry) < new Date()) {
                throw new Error(
                    `Cannot move trip to BOARDING: driver "${dp.fullName}" has an expired license. ` +
                    `Update the license document before operating.`
                );
            }
        }

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

// ---------------------------------------------------------------------------
// assignDriver — assign an APPROVED DriverProfile to a trip
// Enforces brand-scoping, approval status, and license validity.
// ---------------------------------------------------------------------------
const assignDriver = async (tripId, driverId) => {
    const trip = await Trip.findById(tripId).select("status brandId").lean();
    if (!trip) throw new Error("Trip not found.");

    if (["completed", "cancelled"].includes(trip.status)) {
        throw new Error(`Cannot assign a driver to a ${trip.status} trip.`);
    }

    // Validate against DriverProfile (NOT User) — drivers are brand-scoped entities
    const driver = await DriverProfile.findById(driverId)
        .select("fullName phone approvalStatus status brandId licenseExpiry")
        .lean();
    if (!driver) throw new Error("Driver profile not found.");

    // Gate 1: Driver must be APPROVED
    if (driver.approvalStatus !== "APPROVED") {
        throw new Error(
            `Driver "${driver.fullName}" is not APPROVED ` +
            `(status: ${driver.approvalStatus}). Admin must approve the driver first.`
        );
    }

    // Gate 2: Driver must not be SUSPENDED
    if (driver.status === "SUSPENDED") {
        throw new Error(`Driver "${driver.fullName}" is SUSPENDED and cannot be assigned.`);
    }

    // Gate 3: Brand-scope check — driver must belong to the same brand as the trip
    if (driver.brandId?.toString() !== trip.brandId?.toString()) {
        throw new Error(
            `Driver "${driver.fullName}" does not belong to this trip's brand. ` +
            `Drivers are brand-scoped and cannot be cross-assigned.`
        );
    }

    // Gate 4: License must not be expired
    if (driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date()) {
        throw new Error(
            `Driver "${driver.fullName}" has an expired license. ` +
            `Update the license document before assigning to a trip.`
        );
    }

    const updated = await Trip.findByIdAndUpdate(
        tripId,
        { driverId },
        { new: true }
    ).populate("driverId", "fullName phone licenseType status");

    logger.info("tripService: driver assigned", { tripId, driverId, driverName: driver.fullName });
    return updated;
};

// ---------------------------------------------------------------------------
// getDriversByBrand — list APPROVED DriverProfiles for a brand
// Used by the schedule/trip driver assignment dropdown.
// ---------------------------------------------------------------------------
const getDriversByBrand = async (brandId) => {
    const drivers = await DriverProfile.find({
        brandId,
        approvalStatus: "APPROVED",
        status: { $in: ["AVAILABLE", "OFF_DUTY"] },  // exclude ON_DUTY (already driving) and SUSPENDED
    })
        .select("fullName phone licenseType licenseExpiry assignedBusId status")
        .populate("assignedBusId", "busName busNumber")
        .lean();
    return drivers;
};

module.exports = {
    createTrip,
    getTripsByOwnerId,
    getTripDetails,
    updateTripDetails,
    removeTrip,
    assignDriver,
    getDriversByBrand,
    validateStatusTransition,  // exported for testing
};

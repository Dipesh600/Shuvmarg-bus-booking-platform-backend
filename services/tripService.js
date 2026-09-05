const BusOwner         = require("../models/busOwnerModel.js");
const Bus              = require("../models/fleetModel.js");
const Route            = require("../models/busRouteModel.js");
const RouteVariant     = require("../models/routeVariantModel.js");
const OperatorRouteConfig = require("../models/operatorRouteConfigModel.js");
const Trip             = require("../models/tripModel.js");
const SeatTemplate     = require('../models/seatTemplateModel.js');
const Seat             = require("../models/seatsModel.js");
const TripSeatLayoutSnapshot = require("../models/tripSeatLayoutSnapshotModel.js");
const User             = require("../models/userModel.js");
const DriverProfile    = require("../models/driverProfileModel.js");
const logger           = require("../utils/logger.js");
const { tripSeatLayoutDualWriteService } = require("../src/modules/seat-layout-v3-persistence");
const { buildCompatibilitySeatsFromV3 } = require("./tripSeatCompatibilityService.js");

const { assertDriverEligible, assertAssignableTrip } = require("../src/shared/crew/driver-eligibility.policy");
const { normalizeTripStatus, canTransition } = require("../src/shared/crew/trip-status.policy");
const AppError = require("../src/shared/errors/app-error");

const validateStatusTransition = (currentStatus, newStatus) => {
    if (!canTransition(currentStatus, newStatus)) {
        throw new AppError(`Invalid status transition: "${currentStatus}" → "${newStatus}".`, 400);
    }
};

// Helper: check bus owner KYC approval
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
        const v3Seats = await buildCompatibilitySeatsFromV3(busId);
        if (v3Seats) ({ seata, seatb, seatc } = v3Seats);
    }

    if (seata.length === 0 && seatb.length === 0 && seatc.length === 0) {
        throw new Error("This fleet has no published V3 seat-layout assignment.");
    }

    const tripId = `TRIP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const creation = await tripSeatLayoutDualWriteService.createTrip({
        trip: {
            tripId, busId, routeId: resolvedRouteId, variantId: resolvedVariantId,
            seatTemplateId: seatTemplateId || null, ownerId, brandId, tripDate,
            departureTime, arrivalTime, shift, tripFare: tripFare ?? null,
            recurrence: recurrence || "none", daysOfWeek: daysOfWeek || [],
            autoGenerateUntil: autoGenerateUntil || null,
            isActive: isActive !== undefined ? isActive : true, status: "scheduled",
        },
        legacySeats: {
            seata: seata.map((seat) => ({ seatNo: seat.seatNo, booked: false })),
            seatb: seatb.map((seat) => ({ seatNo: seat.seatNo, booked: false })),
            seatc: seatc.map((seat) => ({ seatNo: seat.seatNo, booked: false })),
        },
        defaultFare: tripFare ?? null,
    });
    const { trip: newTrip, seats: tripSeats } = creation;

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
const updateTripDetails = async (tripId, updateData, ownerId = null, adminId = null) => {
    const query = { _id: tripId };
    if (ownerId) query.ownerId = ownerId;
    // Only documented editable fields are accepted, never Mongo update operators,
    // ownership, brand or audit fields supplied by a client.
    const allowed = ["tripDate", "departureTime", "arrivalTime", "shift", "tripFare",
        "recurrence", "daysOfWeek", "autoGenerateUntil", "isActive", "status", "driverId"];
    const updates = Object.fromEntries(Object.entries(updateData).filter(([key]) => allowed.includes(key)));
    const current = await Trip.findOne(query).select("status driverId brandId tripDate").lean();
    if (!current) throw new AppError("Trip not found or unauthorized.", 404);
    if (updates.status !== undefined) {
        updates.status = normalizeTripStatus(updates.status);
        validateStatusTransition(current.status, updates.status);
    }
    if (updates.driverId !== undefined) assertAssignableTrip(current);
    const startsOperating = ["boarding", "in-transit"].includes(updates.status);
    const changesDriver = updates.driverId !== undefined;
    if (changesDriver && !adminId) throw new AppError("Admin identity is required for driver assignment.", 403);
    if (startsOperating || changesDriver || (updates.tripDate !== undefined && current.driverId)) {
        const assignedDriverId = changesDriver ? updates.driverId : current.driverId;
        const driver = assignedDriverId ? await DriverProfile.findById(assignedDriverId).lean() : null;
        assertDriverEligible(driver, { brandId: current.brandId, at: updates.tripDate || current.tripDate });
    }
    // Do not overwrite a lifecycle or assignment change made since our checks.
    const trip = await Trip.findOneAndUpdate(
        { ...query, status: current.status, driverId: current.driverId || null },
        { $set: updates, ...(changesDriver ? { $push: { driverAssignmentLog: {
            driverId: updates.driverId, assignedBy: adminId, assignedAt: new Date(), reason: "Admin trip update",
        } } } : {}) }, { new: true, runValidators: true }
    );
    if (!trip) throw new AppError("Trip changed. Refresh and retry.", 409);
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

    if (["in-transit", "completed"].includes(normalizeTripStatus(trip.status))) {
        throw new Error(`Cannot delete a trip with status "${trip.status}". Cancel it first.`);
    }

    if (await TripSeatLayoutSnapshot.exists({ tripId: trip._id })) {
        throw new Error("This trip has an immutable seat-layout snapshot and cannot be deleted. Cancel it instead.");
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
const assignDriver = async (tripId, driverId, adminId) => {
    if (!adminId) throw new AppError("Admin identity is required for driver assignment.", 403);
    const trip = await Trip.findById(tripId).select("status brandId tripDate").lean();
    assertAssignableTrip(trip);
    const driver = driverId ? await DriverProfile.findById(driverId).lean() : null;
    assertDriverEligible(driver, { brandId: trip.brandId, at: trip.tripDate });
    const updated = await Trip.findOneAndUpdate(
        { _id: tripId, status: trip.status }, { $set: { driverId }, $push: { driverAssignmentLog: {
            driverId, assignedBy: adminId, assignedAt: new Date(), reason: "Admin driver assignment",
        } } },
        { new: true, runValidators: true }
    ).populate("driverId", "fullName phone licenseType status");
    if (!updated) throw new AppError("Trip changed. Refresh and retry.", 409);
    logger.info("tripService: driver assigned", { tripId, driverId });
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

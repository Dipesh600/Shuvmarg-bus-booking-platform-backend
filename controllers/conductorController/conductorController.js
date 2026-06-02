/**
 * controllers/conductorController/conductorController.js
 *
 * Boarding confirmation and passenger manifest endpoints.
 *
 * Who calls this:
 *   - Bus owner (acting as conductor) via their mobile/admin interface
 *   - Future: dedicated conductor role users
 *
 * Routes (registered in conductorRoutes.js):
 *   POST /api/conductor/confirmBoarding   — mark passenger as boarded
 *   GET  /api/conductor/manifest/:tripId  — full passenger manifest
 */

const Booking = require("../../models/bookTicketModel.js");
const Trip    = require("../../models/tripModel.js");
const logger  = require("../../utils/logger.js");

// ---------------------------------------------------------------------------
// POST /api/conductor/confirmBoarding
// Body: { ticketId, tripId }
// ---------------------------------------------------------------------------
const confirmBoarding = async (req, res) => {
    try {
        const { ticketId, tripId } = req.body;
        const userId   = req.userInfo?.id;
        const userRole = req.userInfo?.role;

        if (!ticketId || !tripId) {
            return res.status(400).json({
                success: false,
                message: "ticketId and tripId are required.",
            });
        }

        // ── Authorization: Bus Owner OR Conductor ─────────────────────────────
        let trip;
        if (userRole === "busOwner") {
            // Bus owner: directly owns the trip
            trip = await Trip.findOne({ _id: tripId, ownerId: userId }).lean();
        } else if (userRole === "conductor") {
            // Conductor: must belong to the same brand that owns the trip
            const ConductorProfile = require("../../models/conductorProfileModel.js");
            const profile = await ConductorProfile.findOne({ userId, status: { $ne: "INACTIVE" } }).lean();
            if (!profile) {
                return res.status(403).json({
                    success: false,
                    message: "Conductor profile not found or deactivated.",
                });
            }
            trip = await Trip.findOne({ _id: tripId, brandId: profile.brandId }).lean();
        }

        if (!trip) {
            return res.status(404).json({
                success: false,
                message: "Trip not found or you are not authorized for this trip.",
            });
        }

        // Only allow boarding confirmation when trip is in boarding or in_transit status
        if (!["boarding", "in_transit"].includes(trip.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot confirm boarding on a trip with status: "${trip.status}". Trip must be "boarding" or "in_transit".`,
            });
        }

        // Find the booking
        const booking = await Booking.findOne({ ticketId, tripId }).lean();
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: `No booking found for ticket ${ticketId} on this trip.`,
            });
        }

        // Idempotent — don't error if already confirmed
        if (booking.boardingConfirmed) {
            return res.status(200).json({
                success: true,
                message: "Passenger already confirmed as boarded.",
                data: {
                    ticketId,
                    boardingConfirmedAt: booking.boardingConfirmedAt,
                    alreadyBoarded: true,
                },
            });
        }

        // Mark as boarded
        const updated = await Booking.findOneAndUpdate(
            { ticketId, tripId },
            {
                $set: {
                    boardingConfirmed:   true,
                    boardingConfirmedAt: new Date(),
                    boardingConfirmedBy: userId,
                },
            },
            { new: true }
        );

        logger.info("conductor: boarding confirmed", {
            tripId,
            conductorId: userId,
            seats: updated.seats,
        });

        return res.status(200).json({
            success: true,
            message: "Passenger boarding confirmed successfully.",
            data: {
                ticketId,
                tripId,
                seats:              updated.seats,
                boardingPoint:      updated.boardingPoint,
                passengerDetails:   updated.passengerDetails,
                boardingConfirmedAt: updated.boardingConfirmedAt,
            },
        });

    } catch (error) {
        logger.error("conductor: confirmBoarding error", { error: error.message });
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

// ---------------------------------------------------------------------------
// GET /api/conductor/manifest/:tripId
// Returns full passenger manifest for a trip (for conductor's display)
// ---------------------------------------------------------------------------
const getTripManifest = async (req, res) => {
    try {
        const { tripId } = req.params;
        const userId   = req.userInfo?.id;
        const userRole = req.userInfo?.role;

        // ── Authorization: Bus Owner OR Conductor ─────────────────────────────
        let tripFilter;
        if (userRole === "busOwner") {
            tripFilter = { _id: tripId, ownerId: userId };
        } else if (userRole === "conductor") {
            const ConductorProfile = require("../../models/conductorProfileModel.js");
            const profile = await ConductorProfile.findOne({ userId, status: { $ne: "INACTIVE" } }).lean();
            if (!profile) {
                return res.status(403).json({
                    success: false,
                    message: "Conductor profile not found or deactivated.",
                });
            }
            tripFilter = { _id: tripId, brandId: profile.brandId };
        }

        const trip = await Trip.findOne(tripFilter)
            .populate("routeId", "routeName from to")
            .populate("busId",   "busName busNumber")
            .lean();

        if (!trip) {
            return res.status(404).json({
                success: false,
                message: "Trip not found or not authorized.",
            });
        }

        // Fetch all confirmed bookings for this trip
        const bookings = await Booking.find({ tripId })
            .populate("userId", "name phone email")
            .lean();

        const manifest = bookings.map(b => ({
            ticketId:           b.ticketId,
            seats:              b.seats,
            passengerDetails:   b.passengerDetails || [],
            boardingPoint:      b.boardingPoint,
            droppingPoint:      b.droppingPoint,
            boardingConfirmed:  b.boardingConfirmed || false,
            boardingConfirmedAt: b.boardingConfirmedAt || null,
            bookingStatus:      b.status,
            paymentGateway:     b.gateway,
            totalAmount:        b.totalAmount,
            user: {
                name:  b.userId?.name,
                phone: b.userId?.phone,
            },
        }));

        const stats = {
            totalBooked:     bookings.length,
            boarded:         bookings.filter(b => b.boardingConfirmed).length,
            notYetBoarded:   bookings.filter(b => !b.boardingConfirmed).length,
        };

        logger.info("conductor: manifest fetched", { tripId, userId, totalBookings: bookings.length });

        return res.status(200).json({
            success: true,
            message: "Passenger manifest fetched successfully.",
            data: {
                trip: {
                    tripId:        trip.tripId,
                    status:        trip.status,
                    tripDate:      trip.tripDate,
                    departureTime: trip.departureTime,
                    arrivalTime:   trip.arrivalTime,
                    route:         trip.routeId,
                    bus:           trip.busId,
                },
                stats,
                manifest,
            },
        });

    } catch (error) {
        logger.error("conductor: getTripManifest error", { error: error.message });
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = { confirmBoarding, getTripManifest };

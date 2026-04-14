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
        const conductorId = req.userInfo?.id;

        if (!ticketId || !tripId) {
            return res.status(400).json({
                success: false,
                message: "ticketId and tripId are required.",
            });
        }

        // Verify the trip exists and belongs to this owner (conductorId = ownerId)
        const trip = await Trip.findOne({ _id: tripId, ownerId: conductorId }).lean();
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
                    boardingConfirmedBy: conductorId,
                },
            },
            { new: true }
        );

        logger.info("conductor: boarding confirmed", {
            ticketId,
            tripId,
            conductorId,
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
        const conductorId = req.userInfo?.id;

        // Verify trip ownership
        const trip = await Trip.findOne({ _id: tripId, ownerId: conductorId })
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

        logger.info("conductor: manifest fetched", { tripId, conductorId, totalBookings: bookings.length });

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

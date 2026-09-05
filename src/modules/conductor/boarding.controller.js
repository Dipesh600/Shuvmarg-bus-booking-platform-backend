"use strict";

const { isObjectIdOrHexString } = require("mongoose");
const AppError = require("../../shared/errors/app-error");
const { normalizeTripStatus } = require("../../shared/crew/trip-status.policy");

function createConductorController({ Booking, Trip, ConductorProfile, logger }) {
  const tripFilter = async (req, tripId) => {
    const userId = req.userInfo?.id;
    const role = req.userInfo?.activeRole || req.userInfo?.role;
    if (!userId) throw new AppError("Authentication required.", 401);
    if (!isObjectIdOrHexString(tripId)) throw new AppError("Trip not found.", 404);
    if (role === "busOwner") return { _id: tripId, ownerId: userId };
    if (role !== "conductor") throw new AppError("Conductor access required.", 403);
    const profile = await ConductorProfile.findOne({
      userId, accessStatus: "ACTIVE", status: { $in: ["AVAILABLE", "ON_DUTY"] }, removedAt: null, assignedTripIds: tripId,
    }).lean();
    if (!profile || !profile.brandId || !profile.ownerId) throw new AppError("You are not assigned to this trip or your crew access is inactive.", 403);
    return { _id: tripId, brandId: profile.brandId, ownerId: profile.ownerId };
  };

  const respondError = (error, res) => {
    const status = error.statusCode || 500;
    if (status === 500) logger.error("conductor request failed", { error: error.message });
    return res.status(status).json({ success: false, message: status === 500 ? "Internal Server Error" : error.message });
  };
  const alreadyBoarded = (booking, res) => res.status(200).json({
    success: true, message: "Passenger already confirmed as boarded.",
    data: { ticketId: booking.ticketId, boardingConfirmedAt: booking.boardingConfirmedAt, alreadyBoarded: true },
  });

  const confirmBoarding = async (req, res) => {
    try {
      const { ticketId, tripId } = req.body || {};
      if (typeof ticketId !== "string" || !ticketId.trim() || ticketId.length > 100 || !tripId) {
        throw new AppError("ticketId and tripId are required.", 400);
      }
      const trip = await Trip.findOne(await tripFilter(req, tripId)).lean();
      if (!trip) throw new AppError("Trip not found or not authorized.", 404);
      if (!["boarding", "in-transit"].includes(normalizeTripStatus(trip.status))) {
        throw new AppError('Trip must be "boarding" or "in-transit" to confirm boarding.', 400);
      }
      const filter = { ticketId: ticketId.trim(), tripId, status: "booked" };
      const booking = await Booking.findOne(filter).lean();
      if (!booking) throw new AppError("No eligible booking found for this ticket and trip.", 404);
      if (booking.boardingConfirmed) return alreadyBoarded(booking, res);
      // Recheck eligibility and first-boarding state in the write, so concurrent
      // cancellation/scanning cannot overwrite the original audit stamp.
      const updated = await Booking.findOneAndUpdate(
        { ...filter, boardingConfirmed: { $ne: true } },
        { $set: { boardingConfirmed: true, boardingConfirmedAt: new Date(), boardingConfirmedBy: req.userInfo.id } },
        { new: true, runValidators: true }
      );
      if (!updated) {
        const current = await Booking.findOne(filter).lean();
        if (current?.boardingConfirmed) return alreadyBoarded(current, res);
        throw new AppError("Booking changed and is no longer eligible for boarding.", 409);
      }
      return res.status(200).json({
        success: true, message: "Passenger boarding confirmed successfully.",
        data: { ticketId: updated.ticketId, tripId, seats: updated.seats, boardingPoint: updated.boardingPoint,
          passengerDetails: updated.passengerDetails, boardingConfirmedAt: updated.boardingConfirmedAt },
      });
    } catch (error) { return respondError(error, res); }
  };

  const getTripManifest = async (req, res) => {
    try {
      const { tripId } = req.params;
      const trip = await Trip.findOne(await tripFilter(req, tripId))
        .populate("routeId", "routeName from to").populate("busId", "busName busNumber").lean();
      if (!trip) throw new AppError("Trip not found or not authorized.", 404);
      const bookings = await Booking.find({ tripId, status: "booked" }).populate("userId", "name phone").lean();
      const manifest = bookings.map((b) => ({
        ticketId: b.ticketId, seats: b.seats, passengerDetails: b.passengerDetails || [],
        boardingPoint: b.boardingPoint, droppingPoint: b.droppingPoint,
        boardingConfirmed: b.boardingConfirmed || false, boardingConfirmedAt: b.boardingConfirmedAt || null,
        bookingStatus: b.status, paymentGateway: b.paymentMethod, totalAmount: b.totalAmount,
        user: { name: b.userId?.name, phone: b.userId?.phone },
      }));
      const boarded = bookings.filter((b) => b.boardingConfirmed).length;
      return res.status(200).json({ success: true, message: "Passenger manifest fetched successfully.", data: {
        trip: { tripId: trip.tripId, status: normalizeTripStatus(trip.status), tripDate: trip.tripDate,
          departureTime: trip.departureTime, arrivalTime: trip.arrivalTime, route: trip.routeId, bus: trip.busId },
        stats: { totalBooked: bookings.length, boarded, notYetBoarded: bookings.length - boarded }, manifest,
      } });
    } catch (error) { return respondError(error, res); }
  };
  return { confirmBoarding, getTripManifest };
}

module.exports = { createConductorController };

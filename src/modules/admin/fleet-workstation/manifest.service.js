"use strict";

const summarizeManifest = (bookings) => {
  const summary = {
    totalBookings: bookings.length,
    totalPassengers: bookings.reduce(
      (total, booking) =>
        total +
        (booking.passengerDetails?.length || booking.seats?.length || 0),
      0
    ),
    totalRevenue: 0,
    boardedCount: 0,
    cancelledCount: 0,
    noShowCount: 0,
    refundedAmount: 0,
  };
  for (const booking of bookings) {
    if (booking.status === "booked") {
      summary.totalRevenue += booking.totalAmount;
      if (booking.boardingConfirmed) summary.boardedCount += 1;
    } else if (booking.status === "cancelled") {
      summary.cancelledCount += 1;
      if (booking.refundId) {
        summary.refundedAmount += booking.refundId.refundAmount || 0;
      }
    } else if (booking.status === "no_show") {
      summary.noShowCount += 1;
      summary.totalRevenue += booking.totalAmount;
    }
  }
  return summary;
};

const createManifestService = ({ Trip, Booking }) => {
  const getManifest = async ({ fleetId, tripId }) => {
    const trip = await Trip.findOne({ _id: tripId, busId: fleetId })
      .select("tripId tripDate departureTime arrivalTime status shift")
      .populate("driverId", "fullName phone licenseNumber")
      .populate({
        path: "variantId",
        select: "code direction",
        populate: {
          path: "corridorId",
          select: "originId destinationId",
          populate: [
            { path: "originId", select: "name" },
            { path: "destinationId", select: "name" },
          ],
        },
      })
      .lean();
    if (!trip) return null;
    const bookings = await Booking.find({ tripId: trip._id })
      .populate("userId", "name phone email")
      .populate("refundId", "refundAmount status processedAt")
      .sort({ bookedAt: 1 })
      .lean();
    return { trip, bookings, summary: summarizeManifest(bookings) };
  };
  return { getManifest };
};

module.exports = { createManifestService, summarizeManifest };

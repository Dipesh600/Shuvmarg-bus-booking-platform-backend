"use strict";

const Booking = require("../../../../models/bookTicketModel");
const Refund = require("../../../../models/refundModel");

const EMPTY_BOOKING_STATS = Object.freeze({
  booked: 0,
  cancelled: 0,
  noShow: 0,
  pending: 0,
  seatsSold: 0,
  revenue: 0,
  boardingConfirmed: 0,
});

const aggregateBookingStatsMap = async (tripIds) => {
  if (!tripIds.length) return {};
  const rows = await Booking.aggregate([
    { $match: { tripId: { $in: tripIds } } },
    {
      $group: {
        _id: { tripId: "$tripId", status: "$status" },
        count: { $sum: 1 },
        seatCount: { $sum: { $size: "$seats" } },
        revenue: { $sum: "$totalAmount" },
        boardedCount: { $sum: { $cond: ["$boardingConfirmed", 1, 0] } },
      },
    },
  ]);
  const map = {};
  for (const row of rows) {
    const tripId = row._id.tripId.toString();
    map[tripId] ||= { ...EMPTY_BOOKING_STATS };
    const stats = map[tripId];
    if (row._id.status === "booked") {
      Object.assign(stats, {
        booked: row.count,
        seatsSold: row.seatCount,
        revenue: row.revenue,
        boardingConfirmed: row.boardedCount,
      });
    } else if (row._id.status === "cancelled") {
      stats.cancelled = row.count;
    } else if (row._id.status === "no_show") {
      stats.noShow = row.count;
      stats.revenue += row.revenue;
    } else if (row._id.status === "pending") {
      stats.pending = row.count;
    }
  }
  return map;
};

const aggregateRefundStatsMap = async (tripIds) => {
  if (!tripIds.length) return {};
  const cancelled = await Booking.find({
    tripId: { $in: tripIds },
    status: "cancelled",
  })
    .select("_id tripId")
    .lean();
  if (!cancelled.length) return {};
  const tripByBooking = Object.fromEntries(
    cancelled.map((booking) => [
      booking._id.toString(),
      booking.tripId.toString(),
    ])
  );
  const refunds = await Refund.find({
    bookingId: { $in: cancelled.map((booking) => booking._id) },
    status: "pending",
  })
    .select("bookingId refundAmount")
    .lean();
  const map = {};
  for (const refund of refunds) {
    const tripId = tripByBooking[refund.bookingId.toString()];
    if (!tripId) continue;
    map[tripId] ||= { pendingCount: 0, pendingAmount: 0 };
    map[tripId].pendingCount += 1;
    map[tripId].pendingAmount += refund.refundAmount || 0;
  }
  return map;
};

const attachBookingStats = (trips, map) => {
  for (const trip of trips) {
    trip.bookingStats = map[trip._id.toString()] || { ...EMPTY_BOOKING_STATS };
  }
  return trips;
};

module.exports = {
  EMPTY_BOOKING_STATS,
  aggregateBookingStatsMap,
  aggregateRefundStatsMap,
  attachBookingStats,
};

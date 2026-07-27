"use strict";

const emptyTripStats = () => ({
  booked: 0,
  cancelled: 0,
  noShow: 0,
  pending: 0,
  seatsSold: 0,
  revenue: 0,
  boardingConfirmed: 0,
  refundsPending: 0,
});

const aggregateTodayStats = async ({ Booking, tripIds, totalSeats }) => {
  if (!tripIds.length) return null;
  const results = await Booking.aggregate([
    { $match: { tripId: { $in: tripIds } } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        seatCount: { $sum: { $size: "$seats" } },
        revenue: { $sum: "$totalAmount" },
        originalRevenue: { $sum: "$originalAmount" },
        discounts: { $sum: "$discountAmount" },
        boardedCount: {
          $sum: { $cond: ["$boardingConfirmed", 1, 0] },
        },
      },
    },
  ]);
  const stats = {
    totalBooked: 0,
    totalCancelled: 0,
    totalNoShow: 0,
    totalPending: 0,
    seatsSold: 0,
    boardingConfirmed: 0,
    revenue: 0,
    originalRevenue: 0,
    discounts: 0,
    occupancyPct: 0,
  };
  for (const row of results) {
    if (row._id === "booked") {
      Object.assign(stats, {
        totalBooked: row.count,
        seatsSold: row.seatCount,
        revenue: row.revenue,
        originalRevenue: row.originalRevenue,
        discounts: row.discounts,
        boardingConfirmed: row.boardedCount,
      });
    } else if (row._id === "cancelled") stats.totalCancelled = row.count;
    else if (row._id === "no_show") {
      stats.totalNoShow = row.count;
      stats.revenue += row.revenue;
    } else if (row._id === "pending") stats.totalPending = row.count;
  }
  if (totalSeats > 0) {
    stats.occupancyPct =
      Math.round((stats.seatsSold / totalSeats) * 1000) / 10;
  }
  return stats;
};

const attachTripStats = async ({ Booking, tripGroups, totalSeats }) => {
  const allTrips = tripGroups.flat();
  const rows = await Booking.aggregate([
    { $match: { tripId: { $in: allTrips.map((trip) => trip._id) } } },
    {
      $group: {
        _id: { tripId: "$tripId", status: "$status" },
        count: { $sum: 1 },
        seatCount: { $sum: { $size: "$seats" } },
        revenue: { $sum: "$totalAmount" },
        boardedCount: {
          $sum: { $cond: ["$boardingConfirmed", 1, 0] },
        },
        refundPending: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "cancelled"] },
                  { $eq: ["$refundId", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  const statsByTrip = {};
  for (const row of rows) {
    const id = row._id.tripId.toString();
    const stats = (statsByTrip[id] ||= emptyTripStats());
    if (row._id.status === "booked") {
      Object.assign(stats, {
        booked: row.count,
        seatsSold: row.seatCount,
        revenue: row.revenue,
        boardingConfirmed: row.boardedCount,
      });
    } else if (row._id.status === "cancelled") {
      stats.cancelled = row.count;
      stats.refundsPending = row.refundPending;
    } else if (row._id.status === "no_show") {
      stats.noShow = row.count;
      stats.revenue += row.revenue;
    } else if (row._id.status === "pending") stats.pending = row.count;
  }
  for (const trip of allTrips) {
    const stats = statsByTrip[trip._id.toString()] || emptyTripStats();
    trip.stats = {
      ...stats,
      occupancyPct:
        totalSeats > 0
          ? Math.round((stats.seatsSold / totalSeats) * 1000) / 10
          : 0,
    };
  }
};

module.exports = { aggregateTodayStats, attachTripStats, emptyTripStats };

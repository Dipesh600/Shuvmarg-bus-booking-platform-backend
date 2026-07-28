"use strict";

const { buildBrandFilter } = require("./trip-overview-query.policy.js");
const repository = require("./route-performance.repository.js");
const {
  mapRoutePerformance,
  platformKpis,
} = require("./route-performance.mapper.js");

const bookingRollup = (tripRows, bookingRows) => {
  const bookingsByTrip = Object.fromEntries(
    bookingRows.map((row) => [row._id.toString(), row])
  );
  const result = {};
  for (const row of tripRows) {
    const totals = { totalSeats: 0, totalRevenue: 0, totalBookings: 0 };
    for (const tripId of row.tripIds || []) {
      const booking = bookingsByTrip[tripId.toString()];
      if (!booking) continue;
      totals.totalSeats += booking.seatsSold;
      totals.totalRevenue += booking.revenue;
      totals.totalBookings += booking.bookings;
    }
    result[row._id.toString()] = totals;
  }
  return result;
};

const getRoutePerformance = async (query, now = new Date()) => {
  const windowDays = Math.min(365, Math.max(7, parseInt(query.days) || 30));
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
  windowStart.setUTCHours(0, 0, 0, 0);
  const schedules = await repository.findSchedules(
    buildBrandFilter(query.brandId)
  );
  if (!schedules.length) {
    return {
      routes: [],
      kpis: {
        avgLoadFactor: 0,
        avgCompletionRate: 0,
        topRevenue: 0,
        bottomPerformer: null,
      },
      windowDays,
    };
  }
  const tripRows = await repository.aggregateTrips(
    schedules.map((schedule) => schedule._id),
    windowStart,
    now
  );
  const tripIds = tripRows.flatMap((row) => row.tripIds);
  const bookingRows = await repository.aggregateBookings(tripIds);
  const tripMap = Object.fromEntries(
    tripRows.map((row) => [row._id.toString(), row])
  );
  const bookingMap = bookingRollup(tripRows, bookingRows);
  const routes = schedules.map((schedule) => {
    const id = schedule._id.toString();
    return mapRoutePerformance(
      schedule,
      tripMap[id],
      bookingMap[id],
      windowDays
    );
  });
  const order = { CRITICAL: 0, LOW: 1, MODERATE: 2, HEALTHY: 3, NO_DATA: 4 };
  routes.sort(
    (left, right) =>
      (order[left.metrics.performance] ?? 9) -
      (order[right.metrics.performance] ?? 9)
  );
  return { routes, kpis: platformKpis(routes), windowDays };
};

module.exports = { getRoutePerformance };

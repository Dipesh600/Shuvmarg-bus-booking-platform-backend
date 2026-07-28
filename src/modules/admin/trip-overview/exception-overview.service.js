"use strict";

const {
  buildBrandFilter,
  dayBounds,
  overviewWindow,
  pagination,
} = require("./trip-overview-query.policy.js");
const repository = require("./exception-overview.repository.js");
const {
  aggregateBookingStatsMap,
  aggregateRefundStatsMap,
  attachBookingStats,
} = require("./booking-statistics.service.js");

const attachRefundStats = (trips, map) => {
  for (const trip of trips) {
    trip.refundStats = map[trip._id.toString()] || {
      pendingCount: 0,
      pendingAmount: 0,
    };
  }
};

const getOverview = async (query, now = new Date()) => {
  const pageOptions = pagination(query);
  const { from, to } = overviewWindow(query, now);
  const brandFilter = buildBrandFilter(query.brandId);
  const exceptionResult = await repository.loadExceptions(
    brandFilter,
    from,
    to,
    pageOptions
  );
  const tripIds = exceptionResult.trips.map((trip) => trip._id);
  const [bookingMap, refundMap, stuckTrips] = await Promise.all([
    aggregateBookingStatsMap(tripIds),
    aggregateRefundStatsMap(tripIds),
    repository.findStuckTrips(brandFilter, now),
  ]);
  attachBookingStats(exceptionResult.trips, bookingMap);
  attachRefundStats(exceptionResult.trips, refundMap);
  const { start, end } = dayBounds(now);
  const [todayExceptions, cancelledIds, pendingRefunds] = await Promise.all([
    repository.countTodayExceptions(brandFilter, start, end),
    repository.cancelledTripIds(brandFilter, from, to),
    repository.countPendingRefunds(),
  ]);
  const revenueAtRisk = await repository.revenueAtRisk(cancelledIds);
  return {
    kpis: {
      todayExceptions,
      totalExceptions: exceptionResult.total,
      revenueAtRisk,
      stuckTrips: stuckTrips.length,
      pendingRefunds,
    },
    exceptions: {
      trips: exceptionResult.trips,
      pagination: {
        total: exceptionResult.total,
        page: pageOptions.page,
        limit: pageOptions.limit,
        totalPages: Math.ceil(exceptionResult.total / pageOptions.limit),
      },
    },
    stuckTrips,
  };
};

module.exports = { getOverview };

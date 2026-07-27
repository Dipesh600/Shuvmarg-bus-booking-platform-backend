"use strict";

const noData = (schedule, windowDays) => ({
  schedule,
  metrics: {
    windowDays,
    totalTrips: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    runTrips: 0,
    completionRate: null,
    cancellationRate: null,
    totalSeatsSold: 0,
    totalRevenue: 0,
    avgRevenuePerTrip: 0,
    loadFactor: null,
    busSeats: schedule.busId?.totalSeats || 0,
    performance: "NO_DATA",
  },
});

const performanceTier = (loadFactor, cancellationRate) => {
  if (
    (loadFactor !== null && loadFactor < 30) ||
    cancellationRate > 20
  ) {
    return "CRITICAL";
  }
  if ((loadFactor !== null && loadFactor < 55) || cancellationRate > 10) {
    return "LOW";
  }
  if (loadFactor !== null && loadFactor < 70) return "MODERATE";
  return "HEALTHY";
};

const mapRoutePerformance = (
  schedule,
  tripStats,
  bookingStats,
  windowDays
) => {
  if (!tripStats) return noData(schedule, windowDays);
  const busSeats = schedule.busId?.totalSeats || 0;
  const runTrips =
    tripStats.completedTrips +
    tripStats.inTransitTrips +
    tripStats.boardingTrips;
  const nonCancelled = tripStats.totalTrips - tripStats.cancelledTrips;
  const completionRate =
    nonCancelled > 0 ? Math.round((runTrips / nonCancelled) * 100) : null;
  const cancellationRate =
    tripStats.totalTrips > 0
      ? Math.round((tripStats.cancelledTrips / tripStats.totalTrips) * 100)
      : 0;
  const capacityRan = tripStats.completedTrips * busSeats;
  const loadFactor =
    capacityRan > 0
      ? Math.round(((bookingStats?.totalSeats || 0) / capacityRan) * 100)
      : null;
  const avgRevenuePerTrip =
    runTrips > 0
      ? Math.round((bookingStats?.totalRevenue || 0) / runTrips)
      : 0;
  return {
    schedule,
    metrics: {
      windowDays,
      totalTrips: tripStats.totalTrips,
      completedTrips: tripStats.completedTrips,
      cancelledTrips: tripStats.cancelledTrips,
      runTrips,
      completionRate,
      cancellationRate,
      totalSeatsSold: bookingStats?.totalSeats || 0,
      totalRevenue: bookingStats?.totalRevenue || 0,
      avgRevenuePerTrip,
      loadFactor,
      busSeats,
      performance: performanceTier(loadFactor, cancellationRate),
    },
  };
};

const platformKpis = (routes) => {
  const loadRoutes = routes.filter((route) => route.metrics.loadFactor !== null);
  const completionRoutes = routes.filter(
    (route) => route.metrics.completionRate !== null
  );
  return {
    avgLoadFactor: loadRoutes.length
      ? Math.round(
          loadRoutes.reduce(
            (sum, route) => sum + (route.metrics.loadFactor || 0),
            0
          ) / loadRoutes.length
        )
      : 0,
    avgCompletionRate: completionRoutes.length
      ? Math.round(
          completionRoutes.reduce(
            (sum, route) => sum + (route.metrics.completionRate || 0),
            0
          ) / completionRoutes.length
        )
      : 0,
    topRevenue: routes.reduce(
      (maximum, route) => Math.max(maximum, route.metrics.totalRevenue),
      0
    ),
    totalRoutes: routes.length,
    critical: routes.filter((route) => route.metrics.performance === "CRITICAL")
      .length,
    low: routes.filter((route) => route.metrics.performance === "LOW").length,
    healthy: routes.filter((route) => route.metrics.performance === "HEALTHY")
      .length,
  };
};

module.exports = { mapRoutePerformance, platformKpis };

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapRoutePerformance,
  platformKpis,
} = require("../../src/modules/admin/trip-overview/route-performance.mapper.js");

const schedule = { _id: "s1", busId: { totalSeats: 40 } };
const trips = (overrides = {}) => ({
  totalTrips: 10,
  completedTrips: 8,
  cancelledTrips: 1,
  inTransitTrips: 0,
  boardingTrips: 0,
  ...overrides,
});

test("admin trip-overview route-performance mapper", async (t) => {
  await t.test("maps no-data schedules without inventing metrics", () => {
    const result = mapRoutePerformance(schedule, null, null, 30);
    assert.equal(result.metrics.performance, "NO_DATA");
    assert.equal(result.metrics.loadFactor, null);
    assert.equal(result.metrics.completionRate, null);
  });
  await t.test("calculates load, completion, cancellation, and revenue", () => {
    const result = mapRoutePerformance(
      schedule,
      trips(),
      { totalSeats: 224, totalRevenue: 8000 },
      30
    );
    assert.equal(result.metrics.loadFactor, 70);
    assert.equal(result.metrics.completionRate, 89);
    assert.equal(result.metrics.cancellationRate, 10);
    assert.equal(result.metrics.avgRevenuePerTrip, 1000);
    assert.equal(result.metrics.performance, "HEALTHY");
  });
  await t.test("preserves critical and low thresholds", () => {
    assert.equal(
      mapRoutePerformance(
        schedule,
        trips(),
        { totalSeats: 64, totalRevenue: 0 },
        30
      ).metrics.performance,
      "CRITICAL"
    );
    assert.equal(
      mapRoutePerformance(
        schedule,
        trips(),
        { totalSeats: 160, totalRevenue: 0 },
        30
      ).metrics.performance,
      "LOW"
    );
  });
  await t.test("platform KPIs average only routes with data", () => {
    const routes = [
      mapRoutePerformance(
        schedule,
        trips(),
        { totalSeats: 224, totalRevenue: 8000 },
        30
      ),
      mapRoutePerformance({ _id: "s2", busId: { totalSeats: 40 } }, null, null, 30),
    ];
    assert.deepEqual(platformKpis(routes), {
      avgLoadFactor: 70,
      avgCompletionRate: 89,
      topRevenue: 8000,
      totalRoutes: 2,
      critical: 0,
      low: 0,
      healthy: 1,
    });
  });
});

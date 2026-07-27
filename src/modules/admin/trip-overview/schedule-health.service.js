"use strict";

const { buildBrandFilter, dayBounds } = require("./trip-overview-query.policy.js");
const repository = require("./schedule-health.repository.js");
const policy = require("./schedule-health.policy.js");

const healthForSchedule = async (schedule, now, todayEnd) => {
  const { expectedDate, windowDays } = policy.expectedHorizon(schedule, now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const stats = await repository.loadScheduleTripStats(
    schedule._id,
    todayEnd,
    thirtyDaysAgo
  );
  const actualHorizon = stats.farthestTrip?.tripDate || null;
  const gapDays = actualHorizon
    ? Math.round(
        (expectedDate.getTime() - new Date(actualHorizon).getTime()) / 86400000
      )
    : windowDays;
  let missingDates = [];
  if (schedule.status === "ACTIVE" && gapDays > 0) {
    const scanStart = new Date(now);
    scanStart.setUTCHours(0, 0, 0, 0);
    const existing = await repository.findExistingTripDates(
      schedule._id,
      scanStart,
      expectedDate
    );
    missingDates = policy.findMissingDates(
      schedule,
      scanStart,
      expectedDate,
      existing
    );
  }
  return policy.buildHealthEntry(
    schedule,
    stats,
    expectedDate,
    windowDays,
    missingDates,
    now
  );
};

const summarize = (schedules, suspended) => ({
  totalActive: schedules.length,
  totalSuspended: suspended.length,
  critical: schedules.filter((entry) => entry.health.status === "CRITICAL").length,
  warnings: schedules.filter((entry) => entry.health.status === "WARNING").length,
  healthy: schedules.filter((entry) => entry.health.status === "HEALTHY").length,
  totalMissing: schedules.reduce(
    (total, entry) => total + entry.health.missingCount,
    0
  ),
});

const getScheduleHealth = async (query, now = new Date()) => {
  const source = await repository.findSchedules(buildBrandFilter(query.brandId));
  const { end: todayEnd } = dayBounds(now);
  const schedules = [];
  const suspended = [];
  for (const schedule of source) {
    const entry = await healthForSchedule(schedule, now, todayEnd);
    (schedule.status === "SUSPENDED" ? suspended : schedules).push(entry);
  }
  const order = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 };
  schedules.sort(
    (left, right) =>
      (order[left.health.status] ?? 9) - (order[right.health.status] ?? 9)
  );
  return {
    kpis: summarize(schedules, suspended),
    schedules,
    suspended,
  };
};

module.exports = { getScheduleHealth };

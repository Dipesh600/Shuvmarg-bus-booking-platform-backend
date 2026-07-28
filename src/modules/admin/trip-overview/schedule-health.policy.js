"use strict";

const {
  shouldGenerate,
  isAlternatingDay,
} = require("../../../../services/tripGeneratorCron.js");

const isEffective = (schedule, date) => {
  if (date < new Date(schedule.effectiveFrom)) return false;
  if (schedule.effectiveUntil && date > new Date(schedule.effectiveUntil)) {
    return false;
  }
  return (
    shouldGenerate(schedule, date.getUTCDay()) &&
    isAlternatingDay(schedule, date)
  );
};

const expectedHorizon = (schedule, now) => {
  const windowDays = schedule.advanceGenerationDays || 60;
  const expectedDate = new Date(now);
  expectedDate.setUTCDate(expectedDate.getUTCDate() + windowDays);
  return { expectedDate, windowDays };
};

const findMissingDates = (
  schedule,
  scanStart,
  expectedDate,
  existingDates
) => {
  const missingDates = [];
  const date = new Date(scanStart);
  date.setUTCDate(date.getUTCDate() + 1);
  for (; date <= expectedDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const dateString = date.toISOString().split("T")[0];
    if (isEffective(schedule, date) && !existingDates.has(dateString)) {
      missingDates.push(dateString);
    }
  }
  return missingDates;
};

const suspensionInfo = (schedule, now) => {
  if (schedule.status !== "SUSPENDED") return null;
  const suspendedAt = schedule.suspendedAt || schedule.updatedAt;
  const start = new Date(suspendedAt);
  start.setUTCHours(0, 0, 0, 0);
  let missedTrips = 0;
  for (const date = new Date(start); date <= now; date.setUTCDate(date.getUTCDate() + 1)) {
    if (isEffective(schedule, date)) missedTrips += 1;
  }
  return {
    suspendedAt,
    daysSuspended: Math.round(
      (now.getTime() - new Date(suspendedAt).getTime()) / 86400000
    ),
    missedTrips,
    autoResumeDate: schedule.suspendUntil || null,
    reason: schedule.suspensionReason || null,
  };
};

const buildHealthEntry = (
  schedule,
  stats,
  expectedDate,
  windowDays,
  missingDates,
  now
) => {
  const actualHorizon = stats.farthestTrip?.tripDate || null;
  const gapDays = actualHorizon
    ? Math.round(
        (expectedDate.getTime() - new Date(actualHorizon).getTime()) / 86400000
      )
    : windowDays;
  return {
    schedule,
    health: {
      expectedHorizon: expectedDate,
      actualHorizon,
      gapDays: Math.max(0, gapDays),
      hasGap: gapDays > 3,
      status: gapDays > 7 ? "CRITICAL" : gapDays > 3 ? "WARNING" : "HEALTHY",
      totalTrips: stats.totalTrips,
      upcomingTrips: stats.upcomingTrips,
      cancelledTrips: stats.cancelledTrips,
      missingDates,
      missingCount: missingDates.length,
      lastGeneratedDate: stats.lastGeneratedTrip?.tripDate || null,
      lastGeneratedAt: stats.lastGeneratedTrip?.createdAt || null,
      firstTripDate: stats.firstTrip?.tripDate || null,
      windowDays,
    },
    suspensionInfo: suspensionInfo(schedule, now),
  };
};

module.exports = {
  expectedHorizon,
  findMissingDates,
  buildHealthEntry,
};

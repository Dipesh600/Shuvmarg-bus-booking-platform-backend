"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const {
  generateTripsForDateRange,
} = require("../../../../services/tripGeneratorCron.js");
const logger = require("../../../../utils/logger.js");
const { isValidTime } = require("./schedule-validation.policy.js");
const {
  assertScheduleRouteChainReady,
} = require("./schedule-route-chain.policy.js");

const validateVersion = (changes) => {
  if (!changes.departureTime) throw new Error("New departureTime is required.");
  if (!changes.arrivalTime) throw new Error("New arrivalTime is required.");
  if (!changes.effectiveFrom) {
    throw new Error(
      "effectiveFrom is required — when should the new version start?"
    );
  }
  if (!isValidTime(changes.departureTime)) {
    throw new Error("departureTime must be in HH:MM format.");
  }
  if (!isValidTime(changes.arrivalTime)) {
    throw new Error("arrivalTime must be in HH:MM format.");
  }
  const start = new Date(changes.effectiveFrom);
  if (isNaN(start.getTime())) {
    throw new Error("effectiveFrom must be a valid date.");
  }
  if (start <= new Date()) throw new Error("effectiveFrom must be a future date.");
  return start;
};

const versionDocument = (current, changes, start, adminId, sealDate) => ({
  brandId: current.brandId,
  ownerId: current.ownerId,
  busId: current.busId,
  variantId: current.variantId,
  operatorRouteConfigId: current.operatorRouteConfigId,
  driverId: current.driverId,
  seatTemplateId: current.seatTemplateId,
  departureTime: changes.departureTime,
  arrivalTime: changes.arrivalTime,
  shift: parseInt(changes.departureTime.split(":")[0]) < 12 ? "day" : "night",
  recurrence: current.recurrence,
  daysOfWeek: current.daysOfWeek,
  effectiveFrom: start,
  effectiveUntil: null,
  fareOverride:
    changes.fareOverride !== undefined
      ? changes.fareOverride
      : current.fareOverride,
  advanceGenerationDays: current.advanceGenerationDays,
  advanceBookingDays: current.advanceBookingDays,
  bookingCutoffHours: current.bookingCutoffHours,
  returnScheduleId: current.returnScheduleId,
  operationalModel: current.operationalModel,
  layoverMinutes: current.layoverMinutes,
  versionNumber: (current.versionNumber || 1) + 1,
  parentScheduleId: current._id,
  notes:
    changes.notes ||
    `v${(current.versionNumber || 1) + 1} — effective from ${sealDate.toLocaleDateString()}`,
  status: "ACTIVE",
  activatedBy: adminId,
  activatedAt: new Date(),
  createdBy: "ADMIN",
});

const createScheduleVersion = async (scheduleId, changes, adminId) => {
  const start = validateVersion(changes);
  const current = await Schedule.findById(scheduleId);
  if (!current) throw new Error("Schedule not found.");
  if (current.status !== "ACTIVE") {
    throw new Error(
      `Only ACTIVE schedules can be versioned. Current status: "${current.status}".`
    );
  }
  if (current.pendingVersionId) {
    throw new Error(
      "This schedule already has a pending future version. Cancel it first."
    );
  }
  const sealDate = new Date(start);
  sealDate.setDate(sealDate.getDate() - 1);
  current.effectiveUntil = sealDate;
  const newVersion = new Schedule(
    versionDocument(current, changes, start, adminId, sealDate)
  );
  await assertScheduleRouteChainReady(newVersion);
  await newVersion.save();
  current.pendingVersionId = newVersion._id;
  await current.save();
  logger.info("scheduleService: schedule version created", {
    currentScheduleId: scheduleId,
    newVersionId: newVersion._id,
    effectiveFrom: start,
    sealedUntil: sealDate,
    versionNumber: newVersion.versionNumber,
  });
  try {
    const result = await generateTripsForDateRange(
      newVersion._id,
      start,
      current.advanceGenerationDays || 60
    );
    logger.info("scheduleService: version burst generation complete", {
      newVersionId: newVersion._id,
      ...result,
    });
  } catch (error) {
    logger.error("scheduleService: version burst generation failed", {
      error: error.message,
    });
  }
  return { current, newVersion };
};

module.exports = { createScheduleVersion };

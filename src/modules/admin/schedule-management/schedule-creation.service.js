"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const logger = require("../../../../utils/logger.js");
const { validateCreation } = require("./schedule-validation.policy.js");
const {
  validateBrand,
  validateFleet,
  validateSeatTemplate,
} = require("./schedule-creation-gates.service.js");
const { resolveRoutePattern } = require("./schedule-route-pattern.service.js");
const { assertScheduleDriverEligible } = require("./schedule-driver-gate.service");

const scheduleDocument = (data, ownerId, patternId, createdBy) => ({
  brandId: data.brandId,
  ownerId,
  busId: data.busId,
  variantId: data.variantId || null,
  operatorRouteConfigId: patternId,
  driverId: data.driverId || null,
  seatTemplateId: data.seatTemplateId,
  departureTime: data.departureTime,
  arrivalTime: data.arrivalTime,
  shift: data.shift,
  recurrence: data.recurrence,
  daysOfWeek: data.recurrence === "DAILY" ? [] : data.daysOfWeek || [],
  effectiveFrom: new Date(data.effectiveFrom),
  effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
  fareOverride: data.fareOverride || null,
  notes: data.notes || null,
  status: "DRAFT",
  createdBy,
  advanceBookingDays: data.advanceBookingDays ?? 60,
  bookingCutoffHours: data.bookingCutoffHours ?? 2,
  advanceGenerationDays: data.advanceGenerationDays ?? 60,
  operationalModel: data.operationalModel || "TURNAROUND",
  layoverMinutes: data.layoverMinutes ?? 60,
  returnScheduleId: data.returnScheduleId || null,
});

const createSchedule = async (data, createdBy = "ADMIN") => {
  validateCreation(data);
  const brand = await validateBrand(data.brandId);
  const fleet = await validateFleet(data.busId, data.brandId, brand);
  await validateSeatTemplate(data.seatTemplateId);
  const patternId = await resolveRoutePattern(data);
  await assertScheduleDriverEligible(data);
  const conflict = await Schedule.findOne({
    busId: data.busId,
    departureTime: data.departureTime,
    status: "ACTIVE",
  }).lean();
  if (conflict) {
    throw new Error(
      `An ACTIVE schedule already exists for this bus at ${data.departureTime}. ` +
        "A bus cannot have two active schedules at the same departure time."
    );
  }
  const schedule = await Schedule.create(
    scheduleDocument(data, fleet.ownerId, patternId, createdBy)
  );
  logger.info("scheduleService: schedule created", {
    scheduleId: schedule._id,
    brandId: data.brandId,
    busId: data.busId,
    departureTime: data.departureTime,
    recurrence: data.recurrence,
  });
  return schedule;
};

module.exports = { createSchedule };

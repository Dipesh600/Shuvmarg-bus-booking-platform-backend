"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const logger = require("../../../../utils/logger.js");
const { validateCreation } = require("./schedule-validation.policy.js");
const {
  validateBrand,
  validateFleet,
  validateSeatTemplate,
  validateSeatLayoutVersion,
} = require("./schedule-creation-gates.service.js");
const { resolveRoutePattern } = require("./schedule-route-pattern.service.js");

const scheduleDocument = (data, fleet, patternId, createdBy) => ({
  brandId: data.brandId,
  ownerId: fleet.ownerId,
  busId: data.busId,
  variantId: data.variantId || null,
  operatorRouteConfigId: patternId,
  driverId: data.driverId || null,
  seatTemplateId: data.seatTemplateId,
  seatLayoutVersionId:
    data.seatLayoutVersionId || fleet.seatLayoutVersionId || null,
  departureTime: data.departureTime,
  arrivalTime: data.arrivalTime,
  shift: data.shift,
  recurrence: data.recurrence,
  daysOfWeek: data.recurrence === "DAILY" ? [] : data.daysOfWeek || [],
  effectiveFrom: new Date(data.effectiveFrom),
  effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
  fareOverride: data.fareOverride || null,
  seatFareOverrides: require("../../../domain/fare/seat-fare.policy").normalizeSeatFareOverrides(data.seatFareOverrides),
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
  await validateSeatTemplate(data.seatTemplateId, fleet.ownerId);
  const requestedVersion = await validateSeatLayoutVersion(
    data.seatLayoutVersionId, fleet.ownerId, data.seatTemplateId
  );
  if (
    requestedVersion &&
    requestedVersion._id.toString() !== fleet.seatLayoutVersionId?.toString()
  ) {
    throw new Error("Schedule seat layout must match the assigned fleet layout version.");
  }
  const patternId = await resolveRoutePattern(data);
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
    scheduleDocument(data, fleet, patternId, createdBy)
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

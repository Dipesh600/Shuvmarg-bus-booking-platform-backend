"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const logger = require("../../../../utils/logger.js");
const {
  isValidTime,
  validateRecurrence,
} = require("./schedule-validation.policy.js");
const {
  validateSeatTemplate,
  validateSeatLayoutVersion,
} = require("./schedule-creation-gates.service.js");

const EDITABLE = [
  "driverId",
  "seatTemplateId",
  "departureTime",
  "arrivalTime",
  "shift",
  "recurrence",
  "daysOfWeek",
  "effectiveFrom",
  "effectiveUntil",
  "fareOverride",
  "seatFareOverrides",
  "notes",
  "advanceBookingDays",
  "bookingCutoffHours",
  "advanceGenerationDays",
  "returnScheduleId",
  "operationalModel",
  "layoverMinutes",
];

const updateSchedule = async (scheduleId, data) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status === "ACTIVE") {
    throw new Error(
      "Cannot edit an ACTIVE schedule. Suspend it first, make changes, then reactivate."
    );
  }
  if (schedule.status === "INACTIVE") {
    throw new Error("Cannot edit an INACTIVE schedule.");
  }
  if (data.seatTemplateId !== undefined) {
    if (schedule.seatLayoutVersionId) {
      throw new Error("A versioned schedule cannot switch seat templates directly. Revise the fleet layout instead.");
    }
    await validateSeatTemplate(data.seatTemplateId, schedule.ownerId);
  }
  if (data.seatLayoutVersionId !== undefined) {
    if (data.seatLayoutVersionId?.toString() !== schedule.seatLayoutVersionId?.toString()) {
      throw new Error("A schedule's pinned seat layout version cannot be replaced directly.");
    }
    await validateSeatLayoutVersion(data.seatLayoutVersionId, schedule.ownerId);
  }
  for (const field of EDITABLE) {
    if (data[field] !== undefined) schedule[field] = field === "seatFareOverrides"
      ? require("../../../domain/fare/seat-fare.policy").normalizeSeatFareOverrides(data[field])
      : data[field];
  }
  if (data.departureTime && !isValidTime(data.departureTime)) {
    throw new Error("departureTime must be in HH:MM format.");
  }
  if (data.arrivalTime && !isValidTime(data.arrivalTime)) {
    throw new Error("arrivalTime must be in HH:MM format.");
  }
  if (data.recurrence || data.daysOfWeek) {
    validateRecurrence(schedule.recurrence, schedule.daysOfWeek);
  }
  await schedule.save();
  logger.info("scheduleService: schedule updated", { scheduleId });
  return schedule;
};

module.exports = { updateSchedule };

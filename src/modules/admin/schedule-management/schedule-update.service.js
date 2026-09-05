"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const logger = require("../../../../utils/logger.js");
const { assertScheduleDriverEligible } = require("./schedule-driver-gate.service");
const {
  isValidTime,
  validateRecurrence,
} = require("./schedule-validation.policy.js");

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
  for (const field of EDITABLE) {
    if (data[field] !== undefined) schedule[field] = data[field];
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
  await assertScheduleDriverEligible(schedule);
  await schedule.save();
  logger.info("scheduleService: schedule updated", { scheduleId });
  return schedule;
};

module.exports = { updateSchedule };

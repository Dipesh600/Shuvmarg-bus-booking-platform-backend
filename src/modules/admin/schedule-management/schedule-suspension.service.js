"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const Fleet = require("../../../../models/fleetModel.js");
const {
  generateWindow,
} = require("./schedule-activation.service.js");
const {
  assertScheduleRouteChainReady,
} = require("./schedule-route-chain.policy.js");
const logger = require("../../../../utils/logger.js");

const setSuspended = async (schedule, adminId, reason, until) => {
  schedule.status = "SUSPENDED";
  schedule.suspendedBy = adminId;
  schedule.suspendedAt = new Date();
  schedule.suspensionReason = reason;
  schedule.suspendUntil = until ? new Date(until) : null;
  await schedule.save();
};

const suspendSchedule = async (scheduleId, adminId, reason, suspendUntil) => {
  if (!reason) throw new Error("Suspension reason is required.");
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status !== "ACTIVE") {
    throw new Error(`Cannot suspend a schedule with status "${schedule.status}".`);
  }
  await setSuspended(schedule, adminId, reason, suspendUntil);
  if (schedule.returnScheduleId) {
    const linked = await Schedule.findById(schedule.returnScheduleId);
    if (linked?.status === "ACTIVE") {
      await setSuspended(
        linked,
        adminId,
        `Auto-suspended with primary: ${reason}`,
        suspendUntil
      );
    }
  }
  const remaining = await Schedule.findOne({
    busId: schedule.busId,
    _id: { $ne: scheduleId },
    status: "ACTIVE",
  })
    .select("_id")
    .lean();
  if (!remaining) {
    await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: false });
    logger.info(
      "scheduleService: fleet setupComplete reset (no active schedules remain)",
      { busId: schedule.busId }
    );
  }
  logger.info("scheduleService: schedule suspended", {
    scheduleId,
    adminId,
    reason,
    suspendUntil,
  });
  return schedule;
};

const resumeDocument = async (schedule, adminId) => {
  schedule.status = "ACTIVE";
  schedule.suspendUntil = null;
  schedule.suspensionReason = null;
  schedule.resumedBy = adminId;
  schedule.resumedAt = new Date();
  await schedule.save();
};

const resumeSchedule = async (scheduleId, adminId) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status !== "SUSPENDED") {
    throw new Error(
      `Cannot resume a schedule with status "${schedule.status}". Only SUSPENDED schedules can be resumed.`
    );
  }
  await assertScheduleRouteChainReady(schedule);
  await resumeDocument(schedule, adminId);
  if (schedule.returnScheduleId) {
    const linked = await Schedule.findById(schedule.returnScheduleId);
    if (linked?.status === "SUSPENDED") {
      await assertScheduleRouteChainReady(linked);
      await resumeDocument(linked, adminId);
    }
  }
  await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: true });
  try {
    await generateWindow(schedule, "resume");
  } catch (error) {
    logger.error("scheduleService: resume burst generation failed", {
      scheduleId,
      error: error.message,
    });
    throw new Error("Schedule resumed but trip generation failed. " + error.message);
  }
  logger.info("scheduleService: schedule resumed", { scheduleId, adminId });
  return schedule;
};

module.exports = { suspendSchedule, resumeSchedule };

"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const Fleet = require("../../../../models/fleetModel.js");
const {
  generateTripsForDateRange,
} = require("../../../../services/tripGeneratorCron.js");
const {
  assertScheduleRouteChainReady,
} = require("./schedule-route-chain.policy.js");
const logger = require("../../../../utils/logger.js");
const { assertScheduleDriverEligible } = require("./schedule-driver-gate.service");

const activateSchedule = async (scheduleId, adminId) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status === "ACTIVE") throw new Error("Schedule is already ACTIVE.");
  if (schedule.status === "INACTIVE") {
    throw new Error("Cannot reactivate an INACTIVE schedule. Create a new one.");
  }
  const fleet = await Fleet.findById(schedule.busId)
    .select("approvalStatus status busName busNumber")
    .lean();
  if (!fleet) throw new Error("Fleet not found — cannot activate schedule.");
  if (fleet.approvalStatus !== "APPROVED") {
    throw new Error(
      `Fleet "${fleet.busNumber}" is not APPROVED. Approve the vehicle first.`
    );
  }
  if (fleet.status !== "ACTIVE") {
    throw new Error(
      `Fleet "${fleet.busNumber}" is not ACTIVE. Cannot activate schedule.`
    );
  }
  await assertScheduleRouteChainReady(schedule);
  await assertScheduleDriverEligible(schedule);
  const linkedSchedule = schedule.returnScheduleId ? await Schedule.findById(schedule.returnScheduleId) : null;
  if (linkedSchedule && ["DRAFT", "SUSPENDED"].includes(linkedSchedule.status)) {
    await assertScheduleRouteChainReady(linkedSchedule);
    await assertScheduleDriverEligible(linkedSchedule);
  }
  schedule.status = "ACTIVE";
  schedule.activatedBy = adminId;
  schedule.activatedAt = new Date();
  await schedule.save();
  if (linkedSchedule) {
    const linked = linkedSchedule;
    if (linked && ["DRAFT", "SUSPENDED"].includes(linked.status)) {
      linked.status = "ACTIVE";
      linked.activatedBy = adminId;
      linked.activatedAt = new Date();
      await linked.save();
    }
  }
  logger.info(
    "scheduleService: schedule activated (no trip generation yet — awaiting go-live)",
    { scheduleId, adminId }
  );
  return schedule;
};

const generateWindow = async (schedule, mode = "go-live") => {
  await assertScheduleDriverEligible(schedule);
  if (schedule.returnScheduleId) {
    const linked = await Schedule.findById(schedule.returnScheduleId);
    if (linked) await assertScheduleDriverEligible(linked);
  }
  const days = schedule.advanceGenerationDays || 60;
  const result = await generateTripsForDateRange(schedule._id, new Date(), days);
  const primaryMessage =
    mode === "resume"
      ? "scheduleService: resume burst generation complete"
      : "scheduleService: burst generation complete";
  const linkedMessage =
    mode === "resume"
      ? "scheduleService: resume linked return burst generation complete"
      : "scheduleService: linked return burst generation complete";
  logger.info(primaryMessage, {
    scheduleId: schedule._id,
    ...result,
    windowDays: days,
  });
  if (schedule.returnScheduleId) {
    const linked = await generateTripsForDateRange(
      schedule.returnScheduleId,
      new Date(),
      days
    );
    logger.info(linkedMessage, {
      scheduleId: schedule.returnScheduleId,
      ...linked,
      windowDays: days,
    });
  }
};

const goLiveSchedule = async (scheduleId, adminId) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status !== "ACTIVE") {
    throw new Error(
      `Cannot go live on a schedule with status "${schedule.status}". Activate first.`
    );
  }
  await assertScheduleRouteChainReady(schedule);
  logger.info("scheduleService: go-live triggered — starting burst generation", {
    scheduleId,
    adminId,
  });
  try {
    await generateWindow(schedule);
    await Fleet.findByIdAndUpdate(schedule.busId, { setupComplete: true });
  } catch (error) {
    logger.error("scheduleService: burst generation failed", {
      scheduleId,
      error: error.message,
    });
    throw new Error("Failed to generate trips during go-live. " + error.message);
  }
  return schedule;
};

module.exports = { activateSchedule, goLiveSchedule, generateWindow };

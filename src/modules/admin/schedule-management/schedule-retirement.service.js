"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const Fleet = require("../../../../models/fleetModel.js");
const Trip = require("../../../../models/tripModel.js");
const logger = require("../../../../utils/logger.js");

const deactivateDocument = async (schedule, adminId, reason) => {
  schedule.status = "INACTIVE";
  schedule.suspendedBy = adminId;
  schedule.suspendedAt = new Date();
  schedule.suspensionReason =
    reason || "Permanently deactivated by admin.";
  await schedule.save();
};

const upcomingTrips = (scheduleId, now) =>
  Trip.countDocuments({
    scheduleId,
    tripDate: { $gte: now },
    status: "scheduled",
  });

const deactivateSchedule = async (scheduleId, adminId, reason) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status === "INACTIVE") {
    throw new Error("Schedule is already INACTIVE.");
  }
  const now = new Date();
  const upcoming = await upcomingTrips(scheduleId, now);
  if (upcoming > 0) {
    throw new Error(
      `Cannot deactivate: ${upcoming} upcoming trip(s) are still scheduled. ` +
        "Cancel or reassign those trips before deactivating this schedule."
    );
  }
  await deactivateDocument(schedule, adminId, reason);
  if (schedule.returnScheduleId) {
    const linked = await Schedule.findById(schedule.returnScheduleId);
    if (
      linked &&
      linked.status !== "INACTIVE" &&
      (await upcomingTrips(linked._id, now)) === 0
    ) {
      await deactivateDocument(
        linked,
        adminId,
        `Auto-deactivated with primary: ${
          reason || "Permanently deactivated by admin."
        }`
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
  }
  logger.info("scheduleService: schedule deactivated (INACTIVE)", {
    scheduleId,
    adminId,
  });
  return schedule;
};

const deleteSchedule = async (scheduleId) => {
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new Error("Schedule not found.");
  if (schedule.status !== "DRAFT") {
    throw new Error(
      "Only DRAFT schedules can be hard-deleted. " +
        `This schedule is ${schedule.status}. ` +
        "Use deactivate (INACTIVE) to permanently stop it instead."
    );
  }
  if (schedule.returnScheduleId) {
    const linked = await Schedule.findById(schedule.returnScheduleId);
    if (linked?.status === "DRAFT") {
      await Schedule.findByIdAndDelete(linked._id);
      logger.info("scheduleService: linked DRAFT return schedule deleted", {
        scheduleId: linked._id,
      });
    }
  }
  await Schedule.findByIdAndDelete(scheduleId);
  logger.info("scheduleService: DRAFT schedule deleted", { scheduleId });
};

module.exports = { deactivateSchedule, deleteSchedule };

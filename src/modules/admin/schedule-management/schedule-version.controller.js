"use strict";

const service = require("./schedule.service.js");

const createScheduleVersion = async (req, res) => {
  try {
    const adminId = req.admin?._id || req.adminInfo?.id;
    const { current, newVersion } = await service.createScheduleVersion(
      req.params.id,
      req.body,
      adminId
    );
    const format = { month: "short", day: "numeric", year: "numeric" };
    const from = new Date(req.body.effectiveFrom).toLocaleDateString(
      "en-US",
      format
    );
    const sealed = new Date(current.effectiveUntil).toLocaleDateString(
      "en-US",
      format
    );
    return res.status(201).json({
      success: true,
      message:
        `Version ${newVersion.versionNumber} planned. New timings go live ${from}. ` +
        `Current service sealed until ${sealed}.`,
      data: { currentSchedule: current, newVersion },
    });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("already has")
        ? 409
        : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

const deactivateSchedule = async (req, res) => {
  try {
    const adminId = req.admin?._id || req.adminInfo?.id;
    const schedule = await service.deactivateSchedule(
      req.params.id,
      adminId,
      req.body.reason
    );
    return res.status(200).json({
      success: true,
      message:
        "Schedule is now INACTIVE. Create a new schedule to resume this service.",
      data: schedule,
    });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("upcoming trip")
        ? 409
        : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = { createScheduleVersion, deactivateSchedule };

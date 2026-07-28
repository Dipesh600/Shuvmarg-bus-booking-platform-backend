"use strict";

const service = require("./schedule.service.js");

const adminId = (req) => req.admin?._id || req.adminInfo?.id;
const errorResponse = (res, error, conflictText) => {
  const status = error.message.includes("not found")
    ? 404
    : conflictText && error.message.includes(conflictText)
      ? 409
      : 400;
  return res.status(status).json({ success: false, message: error.message });
};

const activateSchedule = async (req, res) => {
  try {
    const schedule = await service.activateSchedule(req.params.id, adminId(req));
    return res.status(200).json({
      success: true,
      message: "Schedule ACTIVATED. Use Go Live to trigger trip generation.",
      data: schedule,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

const goLiveSchedule = async (req, res) => {
  try {
    const schedule = await service.goLiveSchedule(req.params.id, adminId(req));
    return res.status(200).json({
      success: true,
      message:
        "Fleet is now LIVE! Trips are being generated — passengers can start booking.",
      data: schedule,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

const suspendSchedule = async (req, res) => {
  try {
    const { reason, suspendUntil } = req.body;
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Suspension reason is required.",
      });
    }
    const schedule = await service.suspendSchedule(
      req.params.id,
      adminId(req),
      reason,
      suspendUntil
    );
    const message = suspendUntil
      ? `Schedule SUSPENDED until ${new Date(suspendUntil).toLocaleDateString()}. It will auto-resume on that date.`
      : "Schedule SUSPENDED. No further trips will be generated until manually resumed.";
    return res
      .status(200)
      .json({ success: true, message, data: schedule });
  } catch (error) {
    return errorResponse(res, error);
  }
};

const resumeSchedule = async (req, res) => {
  try {
    const schedule = await service.resumeSchedule(req.params.id, adminId(req));
    return res.status(200).json({
      success: true,
      message:
        "Schedule RESUMED. Trips are being regenerated — passengers can book again.",
      data: schedule,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

module.exports = {
  activateSchedule,
  goLiveSchedule,
  suspendSchedule,
  resumeSchedule,
};

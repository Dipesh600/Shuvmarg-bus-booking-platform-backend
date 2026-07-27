"use strict";

const service = require("./schedule.service.js");

const createSchedule = async (req, res) => {
  try {
    const schedule = await service.createSchedule(req.body, "ADMIN");
    return res.status(201).json({
      success: true,
      message:
        "Schedule created in DRAFT status. Review it and click Activate to begin generating daily trips.",
      data: schedule,
    });
  } catch (error) {
    return res.status(error.message.includes("not found") ? 404 : 400).json({
      success: false,
      message: error.message,
    });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const schedule = await service.updateSchedule(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Schedule updated.",
      data: schedule,
    });
  } catch (error) {
    return res
      .status(error.message.includes("not found") ? 404 : 400)
      .json({ success: false, message: error.message });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    await service.deleteSchedule(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "DRAFT schedule deleted." });
  } catch (error) {
    const status = error.message.includes("not found")
      ? 404
      : error.message.includes("Only DRAFT")
        ? 403
        : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

module.exports = { createSchedule, updateSchedule, deleteSchedule };

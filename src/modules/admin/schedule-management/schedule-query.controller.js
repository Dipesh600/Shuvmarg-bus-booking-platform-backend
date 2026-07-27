"use strict";

const service = require("./schedule.service.js");
const logger = require("../../../../utils/logger.js");

const getAllSchedules = async (req, res) => {
  try {
    const { page, limit, status, brandId, busId } = req.query;
    const data = await service.getAllSchedules({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 30,
      status,
      brandId,
      busId,
    });
    return res.status(200).json({ success: true, ...data });
  } catch (error) {
    logger.error("scheduleController: getAllSchedules error", {
      error: error.message,
    });
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

const getScheduleById = async (req, res) => {
  try {
    const schedule = await service.getScheduleById(req.params.id);
    return res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    return res
      .status(error.message.includes("not found") ? 404 : 500)
      .json({ success: false, message: error.message });
  }
};

const getTripsBySchedule = async (req, res) => {
  try {
    const trips = await service.getTripsBySchedule(req.params.id, req.query);
    return res
      .status(200)
      .json({ success: true, results: trips.length, data: trips });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSchedulesByBrand = async (req, res) => {
  try {
    const schedules = await service.getSchedulesByBrand(req.params.brandId, {
      status: req.query.status,
    });
    return res.status(200).json({
      success: true,
      results: schedules.length,
      data: schedules,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllSchedules,
  getScheduleById,
  getTripsBySchedule,
  getSchedulesByBrand,
};

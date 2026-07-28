"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const {
  generateTripsForDate,
  generateTripsForDateRange,
} = require("../../../../services/tripGeneratorCron.js");
const logger = require("../../../../utils/logger.js");

const manualGenerateTrips = async (req, res) => {
  try {
    const { date } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date is required in YYYY-MM-DD format.",
      });
    }
    const result = await generateTripsForDate(date);
    logger.info("scheduleController: manual trip generation", result);
    return res.status(200).json({
      success: true,
      message: `Trip generation complete for ${date}.`,
      data: result,
    });
  } catch (error) {
    logger.error("scheduleController: manualGenerateTrips error", {
      error: error.message,
    });
    return res.status(500).json({ success: false, message: error.message });
  }
};

const burstGenerateTrips = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id).lean();
    if (!schedule) {
      return res
        .status(404)
        .json({ success: false, message: "Schedule not found." });
    }
    if (schedule.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message:
          `Schedule is ${schedule.status}. ` +
          "Only ACTIVE schedules can generate trips.",
      });
    }
    const days = req.body.days || schedule.advanceGenerationDays || 60;
    const result = await generateTripsForDateRange(
      req.params.id,
      new Date(),
      days
    );
    logger.info("scheduleController: burst trip generation", {
      scheduleId: req.params.id,
      ...result,
    });
    return res.status(200).json({
      success: true,
      message:
        `Burst generation complete. ${result.generated} trips created, ` +
        `${result.skipped} skipped.`,
      data: result,
    });
  } catch (error) {
    logger.error("scheduleController: burstGenerateTrips error", {
      error: error.message,
    });
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { manualGenerateTrips, burstGenerateTrips };

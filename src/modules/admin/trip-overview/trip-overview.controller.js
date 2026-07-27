"use strict";

const logger = require("../../../../utils/logger");
const { getOverview: loadOverview } = require("./exception-overview.service.js");
const {
  getScheduleHealth: loadScheduleHealth,
} = require("./schedule-health.service.js");
const { searchTrips: loadTrips } = require("./trip-search.service.js");
const {
  getRoutePerformance: loadRoutePerformance,
} = require("./route-performance.service.js");

const handle = (name, loader) => async (req, res) => {
  try {
    const data = await loader(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error(`tripOverviewController: ${name} error`, {
      error: error.message,
      stack: error.stack,
    });
    const status =
      name === "getOverview" && error.message === "Invalid date format."
        ? 400
        : 500;
    return res
      .status(status)
      .json({ success: false, message: error.message });
  }
};

const getOverview = handle("getOverview", loadOverview);
const getScheduleHealth = handle("getScheduleHealth", loadScheduleHealth);
const searchTrips = handle("searchTrips", loadTrips);
const getRoutePerformance = handle(
  "getRoutePerformance",
  loadRoutePerformance
);

module.exports = {
  getOverview,
  getScheduleHealth,
  searchTrips,
  getRoutePerformance,
};

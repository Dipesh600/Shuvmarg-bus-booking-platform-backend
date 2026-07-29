"use strict";

const Schedule = require("../../../../models/scheduleModel.js");
const OperatorConfig = require(
  "../../../../models/operatorRouteConfigModel.js"
);

function emptyStats() {
  return { total: 0, active: 0, suspended: 0, draft: 0 };
}

async function getBrandRouteServices(brandId) {
  const configs = await OperatorConfig.find({ brandId })
    .populate({
      path: "variantId",
      match: { direction: { $ne: "RETURN" } },
      select: "name direction status corridorId returnVariantId",
      populate: {
        path: "corridorId",
        select: "originId destinationId code",
        populate: [
          { path: "originId", select: "name code" },
          { path: "destinationId", select: "name code" },
        ],
      },
    })
    .populate("activeStops", "name code type")
    .sort({ variantId: 1, isDefault: -1, patternName: 1 })
    .lean();
  const forward = configs.filter((config) => config.variantId !== null);
  if (forward.length === 0) {
    return {
      data: [],
      summary: {
        totalRoutes: 0, activeRoutes: 0,
        totalSchedules: 0, activeSchedules: 0,
      },
    };
  }
  const ids = forward.map((config) => config._id);
  const counts = await Schedule.aggregate([
    { $match: { operatorRouteConfigId: { $in: ids } } },
    {
      $group: {
        _id: {
          configId: "$operatorRouteConfigId", status: "$status",
        },
        count: { $sum: 1 },
      },
    },
  ]);
  const scheduleMap = {};
  for (const row of counts) {
    const key = row._id.configId?.toString();
    if (!key) continue;
    if (!scheduleMap[key]) scheduleMap[key] = emptyStats();
    scheduleMap[key].total += row.count;
    if (row._id.status === "ACTIVE") scheduleMap[key].active += row.count;
    if (row._id.status === "SUSPENDED") {
      scheduleMap[key].suspended += row.count;
    }
    if (row._id.status === "DRAFT") scheduleMap[key].draft += row.count;
  }
  const data = forward.map((config) => {
    const stats = scheduleMap[config._id?.toString()] || emptyStats();
    return { ...config, scheduleStats: stats, isLive: stats.active > 0 };
  });
  return {
    data,
    summary: {
      totalRoutes: forward.length,
      activeRoutes: forward.filter(
        (config) => config.status === "ACTIVE"
      ).length,
      totalSchedules: Object.values(scheduleMap).reduce(
        (total, stats) => total + stats.total, 0
      ),
      activeSchedules: Object.values(scheduleMap).reduce(
        (total, stats) => total + stats.active, 0
      ),
    },
  };
}

module.exports = { getBrandRouteServices };

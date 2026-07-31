"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const BoardingPoint = require("../../../../models/boardingPointsModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");

async function createStop(data) {
  const {
    code, name, type, province, district, municipality,
    coordinates, aliases, status, isSearchable, isRouteStop, parentStopId
  } = data;
  if (!name) throw new Error("Stop name is required.");
  const stop = {
    name, type, province, district, municipality, coordinates,
    aliases: aliases || [], status: status || "ACTIVE",
    ...(isSearchable !== undefined && { isSearchable }),
    ...(isRouteStop !== undefined && { isRouteStop }),
    ...(parentStopId !== undefined && { parentStopId }),
  };
  if (!code) return Stop.createWithUniqueCode(stop);
  const normalizedCode = code.toUpperCase();
  if (await Stop.findOne({ code: normalizedCode })) {
    throw new Error(`Stop with code "${normalizedCode}" already exists.`);
  }
  return Stop.create({ code, ...stop });
}

function getAllStops(filter = {}) {
  return Stop.find(filter)
    .populate("parentStopId", "id code name")
    .sort({ province: 1, district: 1, name: 1 })
    .lean();
}

function searchStops(query) {
  return Stop.find({
    status: "ACTIVE",
    $or: [
      { name: { $regex: query, $options: "i" } },
      { code: { $regex: query, $options: "i" } },
      { aliases: { $regex: query, $options: "i" } },
    ],
  }).limit(10).lean();
}

async function getStopByCode(code) {
  const stop = await Stop.findOne({ code: code.toUpperCase() });
  if (!stop) throw new Error(`Stop "${code}" not found in registry.`);
  return stop;
}

async function updateStop(id, data) {
  const {
    name, type, province, district, municipality, coordinates, status, aliases,
    isSearchable, isRouteStop, parentStopId
  } = data;

  if (isRouteStop === false) {
    const usageCount = await RouteStop.countDocuments({ stopId: id });
    if (usageCount > 0) {
      throw new Error(`REFERENCED:${usageCount}:Cannot disable isRouteStop because this stop is actively used by ${usageCount} RouteStop(s).`);
    }
  }

  const stop = await Stop.findById(id);
  if (!stop) throw new Error("Stop not found.");

  if (name !== undefined) stop.name = name;
  if (type !== undefined) stop.type = type;
  if (province !== undefined) stop.province = province;
  if (district !== undefined) stop.district = district;
  if (municipality !== undefined) stop.municipality = municipality;
  if (coordinates !== undefined) stop.coordinates = coordinates;
  if (status !== undefined) stop.status = status;
  if (aliases !== undefined) stop.aliases = Array.isArray(aliases) ? aliases : [];
  if (isSearchable !== undefined) stop.isSearchable = isSearchable;
  if (isRouteStop !== undefined) stop.isRouteStop = isRouteStop;
  if (parentStopId !== undefined) stop.parentStopId = parentStopId;

  await stop.save();
  return stop;
}

async function deleteStop(id) {
  const stop = await Stop.findById(id);
  if (!stop) throw new Error("Stop not found.");
  const usageCount = await OperatorRouteConfig.countDocuments({
    $or: [
      { activeStops: id }, { returnActiveStops: id },
      { "boardingConfig.stopId": id }, { "timingConfig.stopId": id },
      { "returnBoardingConfig.stopId": id }, { "returnTimingConfig.stopId": id },
    ],
  });
  if (usageCount > 0) {
    throw new Error(
      `REFERENCED:${usageCount}:Stop is actively used by ${usageCount} ` +
      "operator route(s). Remove it from those operators' fleets first."
    );
  }
  await Stop.findByIdAndDelete(id);
  await RouteStop.deleteMany({ stopId: id });
  await BoardingPoint.deleteMany({ stopId: id });
}

module.exports = {
  createStop, getAllStops, searchStops, getStopByCode, updateStop, deleteStop,
};

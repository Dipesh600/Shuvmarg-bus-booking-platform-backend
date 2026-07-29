"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const BoardingPoint = require("../../../../models/boardingPointsModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");

async function createStop(data) {
  const {
    code, name, type, province, district, municipality,
    coordinates, aliases, status,
  } = data;
  if (!name) throw new Error("Stop name is required.");
  const stop = {
    name, type, province, district, municipality, coordinates,
    aliases: aliases || [], status: status || "ACTIVE",
  };
  if (!code) return Stop.createWithUniqueCode(stop);
  const normalizedCode = code.toUpperCase();
  if (await Stop.findOne({ code: normalizedCode })) {
    throw new Error(`Stop with code "${normalizedCode}" already exists.`);
  }
  return Stop.create({ code, ...stop });
}

function getAllStops(filter = {}) {
  return Stop.find(filter).sort({ province: 1, district: 1, name: 1 }).lean();
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

function updateStop(id, data) {
  const {
    name, type, province, district, municipality, coordinates, status, aliases,
  } = data;
  const update = {
    ...(name && { name, _nameLower: name.toLowerCase().trim() }),
    ...(type && { type }),
    ...(province !== undefined && { province }),
    ...(district !== undefined && { district }),
    ...(municipality !== undefined && { municipality }),
    ...(coordinates && { coordinates }),
    ...(status && { status }),
    ...(aliases && { aliases: Array.isArray(aliases) ? aliases : [] }),
  };
  // Preserve legacy behavior: a missing id resolves to null rather than throwing.
  return Stop.findByIdAndUpdate(id, update, { new: true, runValidators: true });
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

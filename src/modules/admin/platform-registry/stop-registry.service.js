"use strict";

const Stop = require("../../../../models/stopModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const BoardingPoint = require("../../../../models/boardingPointsModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");

async function createStop(data, adminId = null) {
  const {
    code, name, type, province, district, municipality,
    coordinates, aliases, status, isSearchable, isRouteStop, parentStopId,
    verificationStatus, source
  } = data;
  if (!name) {
    const err = new Error("Stop name is required.");
    err.code = "VALIDATION_ERROR";
    err.statusCode = 400;
    throw err;
  }
  const stop = {
    name, type, province, district, municipality, coordinates,
    aliases: aliases || [], status: status || "ACTIVE",
    ...(isSearchable !== undefined && { isSearchable }),
    ...(isRouteStop !== undefined && { isRouteStop }),
    ...(parentStopId !== undefined && { parentStopId }),
    ...(verificationStatus !== undefined && { verificationStatus }),
    ...(source !== undefined && { source }),
    ...(adminId && { createdBy: adminId }),
  };
  if (!code) return Stop.createWithUniqueCode(stop);
  const normalizedCode = code.toUpperCase();
  if (await Stop.findOne({ code: normalizedCode })) {
    const err = new Error(`Stop with code "${normalizedCode}" already exists.`);
    err.code = "STOP_CODE_CONFLICT";
    err.statusCode = 409;
    throw err;
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
  if (!stop) {
    const err = new Error(`Stop "${code}" not found in registry.`);
    err.code = "STOP_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }
  return stop;
}

async function updateStop(id, data) {
  const {
    name, type, province, district, municipality, coordinates, status, aliases,
    isSearchable, isRouteStop, parentStopId, verificationStatus, source
  } = data;

  if (isRouteStop === false) {
    const usageCount = await RouteStop.countDocuments({ stopId: id });
    if (usageCount > 0) {
      const err = new Error(`Cannot disable isRouteStop because this stop is actively used by ${usageCount} RouteStop(s).`);
      err.code = "STOP_IN_USE";
      err.statusCode = 409;
      err.details = { routeStopCount: usageCount };
      throw err;
    }
  }

  const stop = await Stop.findById(id);
  if (!stop) {
    const err = new Error("Stop not found.");
    err.code = "STOP_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }

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
  if (verificationStatus !== undefined) stop.verificationStatus = verificationStatus;
  if (source !== undefined) stop.source = source;

  await stop.save();
  return stop;
}

async function deleteStop(id) {
  const stop = await Stop.findById(id);
  if (!stop) {
    const err = new Error("Stop not found.");
    err.code = "STOP_NOT_FOUND";
    err.statusCode = 404;
    throw err;
  }
  
  const opRouteCount = await OperatorRouteConfig.countDocuments({
    $or: [
      { activeStops: id }, { returnActiveStops: id },
      { "boardingConfig.stopId": id }, { "timingConfig.stopId": id },
      { "returnBoardingConfig.stopId": id }, { "returnTimingConfig.stopId": id },
    ],
  });
  const routeStopCount = await RouteStop.countDocuments({ stopId: id });
  const boardingPointCount = await BoardingPoint.countDocuments({ stopId: id });

  if (opRouteCount > 0 || routeStopCount > 0 || boardingPointCount > 0) {
    const err = new Error("Stop is actively used and cannot be deleted.");
    err.code = "STOP_IN_USE";
    err.statusCode = 409;
    err.details = { 
        operatorRouteCount: opRouteCount,
        routeStopCount: routeStopCount,
        boardingPointCount: boardingPointCount 
    };
    throw err;
  }
  
  await Stop.findByIdAndDelete(id);
}

module.exports = {
  createStop, getAllStops, searchStops, getStopByCode, updateStop, deleteStop,
};

"use strict";

const Stop = require("../../../../models/stopModel.js");
const {
  getStopReferenceCounts, hasStopReferences,
} = require("./stop-reference-counts.service.js");

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

  if (isRouteStop === false || status === "INACTIVE") {
    const counts = await getStopReferenceCounts(id);
    const disablesRouteStop = isRouteStop === false && counts.routeStopCount > 0;
    const disablesBoardingParent = counts.boardingLocationCount > 0;
    if (disablesRouteStop || disablesBoardingParent) {
      const err = new Error(
        "Cannot disable a route stop while routes or boarding locations use it."
      );
      err.code = "STOP_IN_USE";
      err.statusCode = 409;
      err.details = counts;
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
  
  const counts = await getStopReferenceCounts(id);
  if (hasStopReferences(counts)) {
    const err = new Error("Stop is actively used and cannot be deleted.");
    err.code = "STOP_IN_USE";
    err.statusCode = 409;
    err.details = counts;
    throw err;
  }
  
  await Stop.findByIdAndDelete(id);
}

module.exports = {
  createStop, getAllStops, searchStops, getStopByCode, updateStop, deleteStop,
};

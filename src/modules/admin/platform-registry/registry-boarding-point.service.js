"use strict";

const BoardingPoint = require("../../../../models/boardingPointsModel.js");
const { getStopByCode } = require("./stop-registry.service.js");

async function createBoardingPoint(data) {
  const { stopCode, pointName, landmark, type, coordinates } = data;
  const stop = await getStopByCode(stopCode);
  return BoardingPoint.create({
    stopId: stop._id,
    city: stop.name,
    pointName,
    landmark,
    type,
    coordinates,
    isGlobal: true,
  });
}

async function getBoardingPointsByStop(stopCode) {
  const stop = await getStopByCode(stopCode);
  return BoardingPoint.find({ stopId: stop._id, status: true })
    .populate("stopId", "name code")
    .lean();
}

async function updateBoardingPoint(id, data) {
  const { pointName, landmark, type } = data;
  const point = await BoardingPoint.findByIdAndUpdate(
    id,
    {
      ...(pointName && { pointName }),
      ...(landmark !== undefined && { landmark }),
      ...(type && { type }),
    },
    { new: true, runValidators: true }
  );
  if (!point) throw new Error("Boarding point not found.");
  return point;
}

async function deleteRegistryBoardingPoint(id) {
  const point = await BoardingPoint.findByIdAndDelete(id);
  if (!point) throw new Error("Boarding point not found.");
}

module.exports = {
  createBoardingPoint, getBoardingPointsByStop,
  updateBoardingPoint, deleteRegistryBoardingPoint,
};

"use strict";

const RouteCorridor = require("../../../../models/routeCorridorModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const Bus = require("../../../../models/fleetModel.js");
const { getStopByCode } = require("./stop-registry.service.js");

async function createCorridor(data, adminId) {
  const { originCode, destinationCode, isSymmetric = true, notes } = data;
  const origin = await getStopByCode(originCode);
  const destination = await getStopByCode(destinationCode);
  const forward = await RouteCorridor.findOne({
    originId: origin._id, destinationId: destination._id,
  });
  const reverse = await RouteCorridor.findOne({
    originId: destination._id, destinationId: origin._id,
  });
  if (forward || reverse) {
    throw new Error(
      `Corridor between "${origin.name}" and "${destination.name}" already exists.`
    );
  }
  return RouteCorridor.create({
    code: `${origin.code}-${destination.code}`,
    originId: origin._id,
    destinationId: destination._id,
    isSymmetric,
    notes,
    createdBy: adminId,
  });
}

function getAllCorridors() {
  return RouteCorridor.find({ status: "ACTIVE" })
    .populate("originId", "name code state")
    .populate("destinationId", "name code state")
    .sort({ code: 1 })
    .lean();
}

async function getCorridorById(id) {
  const corridor = await RouteCorridor.findById(id)
    .populate("originId")
    .populate("destinationId");
  if (!corridor) throw new Error("Corridor not found.");
  return corridor;
}

async function updateCorridor(id, data) {
  const { notes, isSymmetric, status } = data;
  const corridor = await RouteCorridor.findByIdAndUpdate(
    id,
    {
      ...(notes !== undefined && { notes }),
      ...(isSymmetric !== undefined && { isSymmetric }),
      ...(status && { status }),
    },
    { new: true, runValidators: true }
  ).populate("originId destinationId");
  if (!corridor) throw new Error("Corridor not found.");
  return corridor;
}

async function deleteCorridor(id) {
  const corridor = await RouteCorridor.findById(id);
  if (!corridor) throw new Error("Corridor not found.");
  const fleetCount = await Bus.countDocuments({ corridorId: id });
  if (fleetCount > 0) {
    throw new Error(
      `REFERENCED:${fleetCount}:${fleetCount} fleet(s) are assigned to this ` +
      "corridor. Reassign them first."
    );
  }
  const variants = await RouteVariant.find({ corridorId: id });
  for (const variant of variants) {
    const stopCount = await RouteStop.countDocuments({ variantId: variant._id });
    if (stopCount > 0) {
      throw new Error(
        `REFERENCED:${stopCount}:Corridor has variants with stop sequences. ` +
        "Clear the stop sequences first."
      );
    }
  }
  const ids = variants.map((variant) => variant._id);
  await RouteStop.deleteMany({ variantId: { $in: ids } });
  await RouteVariant.deleteMany({ corridorId: id });
  await RouteCorridor.findByIdAndDelete(id);
}

module.exports = {
  createCorridor, getAllCorridors, getCorridorById,
  updateCorridor, deleteCorridor,
};

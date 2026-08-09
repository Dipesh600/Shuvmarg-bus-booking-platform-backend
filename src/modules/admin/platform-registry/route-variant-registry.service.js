"use strict";

const RouteVariant = require("../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const { getCorridorById } = require("./corridor-registry.service.js");
const { assertVariantCanActivate } = require("./variant-activation.policy.js");

async function createVariant(data, adminId) {
  const {
    corridorId, name, type, distanceKm, durationMinutes,
    direction = "FORWARD",
  } = data;
  if (!["FORWARD", "RETURN"].includes(direction)) {
    throw new Error("direction must be FORWARD or RETURN.");
  }
  const corridor = await getCorridorById(corridorId);
  const count = await RouteVariant.countDocuments({ corridorId });
  const index = String(count + 1).padStart(2, "0");
  const forward = await RouteVariant.create({
    code: `${corridor.code}-V${index}`,
    corridorId, name, type, distanceKm, durationMinutes,
    direction, status: "DRAFT", createdBy: adminId,
  });
  return forward;
}

function getVariantsByCorridor(corridorId) {
  return RouteVariant.find({ corridorId, status: "ACTIVE" })
    .populate({
      path: "corridorId",
      populate: [{ path: "originId" }, { path: "destinationId" }],
    })
    .sort({ direction: 1, createdAt: 1 })
    .lean();
}

async function getVariantById(id) {
  const variant = await RouteVariant.findById(id).populate({
    path: "corridorId",
    populate: [{ path: "originId" }, { path: "destinationId" }],
  });
  if (!variant) throw new Error("Route variant not found.");
  return variant;
}

async function updateVariant(id, data) {
  const { name, type, distanceKm, durationMinutes, status } = data;
  if (status === "ACTIVE") await assertVariantCanActivate(await getVariantById(id));
  const variant = await RouteVariant.findByIdAndUpdate(
    id,
    {
      ...(name && { name }), ...(type && { type }),
      ...(distanceKm !== undefined && { distanceKm }),
      ...(durationMinutes !== undefined && { durationMinutes }),
      ...(status && { status }),
    },
    { new: true, runValidators: true }
  );
  if (!variant) throw new Error("Variant not found.");
  return variant;
}

async function deleteVariant(id) {
  const variant = await RouteVariant.findById(id);
  if (!variant) throw new Error("Variant not found.");
  await RouteStop.countDocuments({ variantId: id });
  await RouteStop.deleteMany({ variantId: id });
  await RouteVariant.findByIdAndDelete(id);
}

module.exports = {
  createVariant, getVariantsByCorridor, getVariantById,
  updateVariant, deleteVariant,
};

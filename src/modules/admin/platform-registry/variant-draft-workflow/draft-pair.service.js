"use strict";

const mongoose = require("mongoose");
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const { allocateVariantCode } = require("../variant-code-allocation.service.js");

async function createPairedDrafts({ corridor, direction, data, adminId }) {
  const routeFamilyId = new mongoose.Types.ObjectId();
  const code = await allocateVariantCode(corridor._id, direction);
  const variant = await RouteVariant.create({
    code, corridorId: corridor._id, direction, routeFamilyId,
    originTerminalStopId: data.originTerminalStopId || null,
    destinationTerminalStopId: data.destinationTerminalStopId || null,
    definitionSource: "GOOGLE_ROUTE_REVIEW", status: "DRAFT",
    createdBy: adminId || null, updatedBy: adminId || null,
  });
  if (data.createCompanion === false) return variant;
  const companionDirection = direction === "FORWARD" ? "RETURN" : "FORWARD";
  try {
    const companionCode = await allocateVariantCode(corridor._id, companionDirection);
    const companion = await RouteVariant.create({
      code: companionCode, corridorId: corridor._id, direction: companionDirection,
      routeFamilyId, returnVariantId: variant._id,
      definitionSource: "DERIVED_REVERSE", status: "DRAFT",
      createdBy: adminId || null, updatedBy: adminId || null,
    });
    variant.returnVariantId = companion._id;
    await variant.save();
    return variant;
  } catch (error) {
    await RouteVariant.findByIdAndDelete(variant._id);
    throw error;
  }
}

module.exports = { createPairedDrafts };

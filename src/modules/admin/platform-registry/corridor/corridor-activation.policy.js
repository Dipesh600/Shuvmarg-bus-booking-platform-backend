"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const RouteStop = require("../../../../../models/routeStopModel.js");
const {
  corridorError,
} = require("../../../../domain/corridor/corridor-errors.js");

async function hasUsableVariant(corridorId) {
  const variants = await RouteVariant.find({
    corridorId, status: "ACTIVE",
  }).select("_id").lean();
  for (const variant of variants) {
    if (await RouteStop.countDocuments({ variantId: variant._id }) >= 2) {
      return true;
    }
  }
  return false;
}

async function assertCorridorCanActivate(corridorId) {
  if (!await hasUsableVariant(corridorId)) {
    throw corridorError(
      "CORRIDOR_NOT_READY",
      "A corridor requires an active variant with at least two ordered stops before activation.",
      409
    );
  }
}

module.exports = { assertCorridorCanActivate, hasUsableVariant };

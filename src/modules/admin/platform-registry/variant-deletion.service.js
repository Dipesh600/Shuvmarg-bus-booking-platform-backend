"use strict";

const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const Schedule = require("../../../../models/scheduleModel.js");
const Trip = require("../../../../models/tripModel.js");
const Agent = require("../../../../models/agentModel.js");
const { deleteVariantDraftArtifacts } = require("./variant-draft-cleanup.service.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function deleteVariant(id) {
  const variant = await RouteVariant.findById(id);
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);

  // Find companion draft if any
  let companion = variant.returnVariantId ? await RouteVariant.findById(variant.returnVariantId) : null;
  if (!companion && variant.corridorId) {
    const oppositeDir = variant.direction === "FORWARD" ? "RETURN" : "FORWARD";
    companion = await RouteVariant.findOne({
      corridorId: variant.corridorId,
      direction: oppositeDir,
      status: "DRAFT",
    });
  }

  const deleteIds = [variant._id];
  if (companion && companion.status === "DRAFT") {
    deleteIds.push(companion._id);
  }

  // Ensure neither draft is used in active operations
  for (const vId of deleteIds) {
    const v = await RouteVariant.findById(vId);
    if (!v) continue;
    if (v.status !== "DRAFT") {
      throw routeVariantError(
        "VARIANT_DELETE_REQUIRES_DRAFT",
        "Only an unused draft variant can be permanently deleted. Archive an operational variant instead.",
        409
      );
    }
    const [opConfigs, schedules, trips, agents] = await Promise.all([
      OperatorRouteConfig.countDocuments({ variantId: v._id }),
      Schedule.countDocuments({ variantId: v._id }),
      Trip.countDocuments({ variantId: v._id }),
      Agent.countDocuments({ allowedRouteIds: v._id }),
    ]);
    if (opConfigs > 0 || schedules > 0 || trips > 0 || agents > 0) {
      throw routeVariantError(
        "VARIANT_IN_USE",
        "This variant is referenced by active operations and cannot be permanently deleted.",
        409,
        { operatorRouteConfigCount: opConfigs, scheduleCount: schedules, tripCount: trips, agentRouteAccessCount: agents }
      );
    }
  }

  // Unlink any variant pointers to these drafts
  const mongoose = require("mongoose");
  const validObjectIds = deleteIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validObjectIds.length > 0) {
    await RouteVariant.updateMany(
      { returnVariantId: { $in: validObjectIds } },
      { $set: { returnVariantId: null } }
    );
    await RouteVariant.updateMany(
      { revisionOfVariantId: { $in: validObjectIds } },
      { $set: { revisionOfVariantId: null } }
    );
    await RouteVariant.updateMany(
      { supersededByVariantId: { $in: validObjectIds } },
      { $set: { supersededByVariantId: null } }
    );
  }

  // Clean up stops, draft artifacts, and variant records
  await RouteStop.deleteMany({ variantId: { $in: deleteIds } });
  await Promise.all(deleteIds.map(deleteVariantDraftArtifacts));
  if (deleteIds.length === 1) {
    await RouteVariant.findByIdAndDelete(deleteIds[0]);
  } else {
    await RouteVariant.deleteMany({ _id: { $in: deleteIds } });
  }
}

module.exports = { deleteVariant };

"use strict";

const RouteCorridor = require("../../../../models/routeCorridorModel.js");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { activateVariantDraft } = require("./variant-draft-workflow/activation.service.js");
const { getVariantDetails } = require("./variant-detail.service.js");
const {
  getVariantOperationalReferenceCounts,
  hasOperationalReferences,
} = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

const oppositeDirection = (direction) => direction === "FORWARD" ? "RETURN" : "FORWARD";

async function repairVariantPair(id, adminId) {
  const source = await RouteVariant.findById(id);
  if (!source) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  if (source.status !== "ACTIVE") {
    throw routeVariantError("PAIR_REPAIR_REQUIRES_ACTIVE_ROUTE", "Open the active direction to repair this route pair.", 409);
  }
  const expectedDirection = oppositeDirection(source.direction);
  const linked = source.returnVariantId ? await RouteVariant.findById(source.returnVariantId) : null;
  const linkedEligible = linked && String(linked.corridorId) === String(source.corridorId) &&
    linked.direction === expectedDirection && ["ACTIVE", "DRAFT"].includes(linked.status);
  let candidates = linkedEligible ? [linked] : await RouteVariant.find({
    corridorId: source.corridorId,
    direction: expectedDirection,
    status: { $in: ["ACTIVE", "DRAFT"] },
  }).sort({ updatedAt: -1 });
  if (candidates.length !== 1) {
    throw routeVariantError(
      candidates.length ? "PAIR_REPAIR_AMBIGUOUS" : "PAIR_REPAIR_COMPANION_NOT_FOUND",
      candidates.length
        ? "More than one opposite route is available. Delete obsolete drafts before repairing this pair."
        : "No opposite route is available to repair. Create and review the missing direction first.",
      409,
      { candidateCount: candidates.length }
    );
  }
  const companion = candidates[0];
  const familyId = source.routeFamilyId;
  if (!familyId) throw routeVariantError("PAIR_REPAIR_FAMILY_REQUIRED", "This route has no family identity and needs data support repair.", 409);
  await RouteVariant.findByIdAndUpdate(companion._id, {
    routeFamilyId: familyId,
    returnVariantId: source._id,
    updatedBy: adminId || null,
  }, { runValidators: true, overwriteImmutable: true });
  await RouteVariant.findByIdAndUpdate(source._id, {
    returnVariantId: companion._id,
    updatedBy: adminId || null,
  }, { runValidators: true });
  if (companion.status === "DRAFT") {
    const stopCount = await RouteStop.countDocuments({ variantId: companion._id });
    if (stopCount < 2) {
      throw routeVariantError("PAIR_REPAIR_DRAFT_NOT_READY", "The missing direction is linked, but it needs at least two reviewed stops before activation.", 409);
    }
    await activateVariantDraft(companion._id, adminId);
  }
  return getVariantDetails(source._id);
}

async function retireVariantPair(id, adminId) {
  const source = await RouteVariant.findById(id);
  if (!source) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  if (source.status !== "ACTIVE") {
    throw routeVariantError("PAIR_RETIRE_REQUIRES_ACTIVE_ROUTE", "Only a live route path can be retired.", 409);
  }
  const active = await RouteVariant.find({
    corridorId: source.corridorId,
    routeFamilyId: source.routeFamilyId,
    status: "ACTIVE",
  });
  if (!active.length) throw routeVariantError("PAIR_RETIRE_ACTIVE_ROUTE_NOT_FOUND", "No live route path was found.", 409);
  const counts = await Promise.all(active.map((variant) => getVariantOperationalReferenceCounts(variant._id)));
  const blocked = counts.findIndex(hasOperationalReferences);
  if (blocked >= 0) {
    throw routeVariantError(
      "PAIR_RETIREMENT_BLOCKED",
      "Move active route patterns, schedules, future trips, and agent access before retiring this path.",
      409,
      { variantId: String(active[blocked]._id), ...counts[blocked] }
    );
  }
  const ids = active.map((variant) => variant._id);
  await RouteVariant.updateMany(
    { _id: { $in: ids } },
    { $set: { status: "ARCHIVED", updatedBy: adminId || null } },
    { runValidators: true }
  );
  const remainingActive = await RouteVariant.countDocuments({ corridorId: source.corridorId, status: "ACTIVE" });
  if (remainingActive === 0) {
    await RouteCorridor.findByIdAndUpdate(source.corridorId, { status: "INACTIVE", updatedBy: adminId || null });
  }
  return { retired: true, variantIds: ids.map(String) };
}

module.exports = { repairVariantPair, retireVariantPair };

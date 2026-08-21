"use strict";

const mongoose = require("mongoose");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { allocateVariantCode } = require("./variant-code-allocation.service.js");
const { routeVariantError } = require("./route-variant-errors.js");
const { getVariantDetails } = require("./variant-detail.service.js");

async function cloneOne(source, routeFamilyId, adminId) {
  const existing = await RouteVariant.findOne({
    revisionOfVariantId: source._id, status: "DRAFT",
  }).lean();
  if (existing) return RouteVariant.findById(existing._id);
  const latest = await RouteVariant.findOne({ routeFamilyId, direction: source.direction })
    .sort({ revisionNumber: -1 }).select("revisionNumber").lean();
  const code = await allocateVariantCode(source.corridorId, source.direction);
  const revision = await RouteVariant.create({
    code, corridorId: source.corridorId, name: source.name, type: source.type,
    direction: source.direction, routeFamilyId, revisionOfVariantId: source._id,
    revisionNumber: (latest?.revisionNumber || source.revisionNumber || 1) + 1,
    distanceKm: source.distanceKm, durationMinutes: source.durationMinutes,
    originTerminalStopId: source.originTerminalStopId,
    destinationTerminalStopId: source.destinationTerminalStopId,
    definitionSource: "REVISION", status: "DRAFT",
    createdBy: adminId || null, updatedBy: adminId || null,
  });
  const rows = await RouteStop.find({ variantId: source._id }).sort({ sequence: 1 }).lean();
  if (rows.length) await RouteStop.insertMany(rows.map((row) => ({
    variantId: revision._id, stopId: row.stopId, sequence: row.sequence,
    isMajor: row.isMajor, distanceFromOriginKm: row.distanceFromOriginKm,
    durationFromOriginMins: row.durationFromOriginMins,
    estimatedMinutesFromOrigin: row.estimatedMinutesFromOrigin,
  })));
  return revision;
}

async function createVariantRevision(id, adminId, { includeCompanion = true } = {}) {
  const source = await RouteVariant.findById(id);
  if (!source) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  if (!['ACTIVE', 'INACTIVE'].includes(source.status)) {
    throw routeVariantError("VARIANT_REVISION_REQUIRES_OPERATIONAL_SOURCE", "Resume an existing draft directly; only operational variants need revisions.", 409);
  }
  const routeFamilyId = source.routeFamilyId || new mongoose.Types.ObjectId();
  const revision = await cloneOne(source, routeFamilyId, adminId);
  if (includeCompanion) {
    let companionSource = source.returnVariantId ? await RouteVariant.findById(source.returnVariantId) : null;
    if (companionSource && !['ACTIVE', 'INACTIVE'].includes(companionSource.status)) {
      companionSource = null;
    }
    if (!companionSource) {
      const oppositeDir = source.direction === "FORWARD" ? "RETURN" : "FORWARD";
      companionSource = await RouteVariant.findOne({
        corridorId: source.corridorId, direction: oppositeDir,
        status: { $in: ["ACTIVE", "INACTIVE"] },
      });
      if (companionSource) {
        source.returnVariantId = companionSource._id;
        companionSource.returnVariantId = source._id;
        await Promise.all([source.save(), companionSource.save()]);
      }
    }
    if (companionSource && ['ACTIVE', 'INACTIVE'].includes(companionSource.status)) {
      const companionRevision = await cloneOne(companionSource, routeFamilyId, adminId);
      revision.returnVariantId = companionRevision._id;
      companionRevision.returnVariantId = revision._id;
      await Promise.all([revision.save(), companionRevision.save()]);
    }
  }
  return getVariantDetails(revision._id);
}

async function rollbackVariantRevision(historicalVariantId, adminId) {
  const target = await RouteVariant.findById(historicalVariantId);
  if (!target) throw routeVariantError("VARIANT_NOT_FOUND", "Target historical revision not found.", 404);
  if (target.status === "ACTIVE") {
    throw routeVariantError("VARIANT_ALREADY_ACTIVE", "This revision is already the active version.", 409);
  }

  // Find currently ACTIVE variant in this family or corridor direction
  const activeQuery = target.routeFamilyId
    ? { routeFamilyId: target.routeFamilyId, direction: target.direction, status: "ACTIVE" }
    : { corridorId: target.corridorId, direction: target.direction, status: "ACTIVE" };
  const currentActive = await RouteVariant.findOne(activeQuery);
  if (!currentActive) {
    throw routeVariantError("ACTIVE_VARIANT_NOT_FOUND", "No active variant found to rollback from.", 404);
  }

  // Create a new revision from the current active variant
  const revisionResult = await createVariantRevision(currentActive._id, adminId, { includeCompanion: true });
  const newRevisionId = revisionResult.variant._id;

  // Load target historical stops
  const targetStops = await RouteStop.find({ variantId: target._id })
    .populate("stopId", "code")
    .sort({ sequence: 1 })
    .lean();

  if (targetStops.length < 2) {
    throw routeVariantError("INVALID_HISTORICAL_STOPS", "Historical revision does not contain a valid stop sequence.", 400);
  }

  const inputStops = targetStops.map((s, idx) => ({
    stopCode: s.stopId.code,
    sequence: idx + 1,
    isMajor: s.isMajor,
    distanceFromOriginKm: s.distanceFromOriginKm,
    durationFromOriginMins: s.durationFromOriginMins,
  }));

  const { setVariantStops } = require("./route-stop-sequence.service.js");
  const { activateVariantDraft } = require("./variant-draft-workflow/commit.service.js");

  await setVariantStops(newRevisionId, inputStops, { syncCompanion: true });
  const activated = await activateVariantDraft(newRevisionId, adminId, { syncCompanion: true });

  return getVariantDetails(activated._id);
}

async function deleteHistoricalRevision(revisionId) {
  const variant = await RouteVariant.findById(revisionId);
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Variant revision not found.", 404);
  if (variant.status === "ACTIVE") {
    throw routeVariantError("CANNOT_DELETE_ACTIVE_VARIANT", "Active variants cannot be deleted. Rollback or deactivate first.", 409);
  }

  const Trip = require("../../../../models/tripModel.js");
  const tripCount = await Trip.countDocuments({ variantId: revisionId });

  if (tripCount > 0) {
    variant.status = "ARCHIVED";
    await variant.save();
    return {
      archived: true,
      message: "Revision has historical trip records and was archived to preserve audit integrity.",
    };
  }

  await RouteStop.deleteMany({ variantId: variant._id });
  await RouteVariant.findByIdAndDelete(variant._id);
  return {
    deleted: true,
    message: "Revision permanently deleted.",
  };
}

module.exports = { createVariantRevision, getVariantDetails, rollbackVariantRevision,
  deleteHistoricalRevision };

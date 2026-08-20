"use strict";

const mongoose = require("mongoose");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const OperatorBrand = require("../../../../models/operatorBrandModel.js");
const OperatorRouteConfig = require("../../../../models/operatorRouteConfigModel.js");
const FleetRouteSetup = require("../../../../models/fleetRouteSetupModel.js");
const Schedule = require("../../../../models/scheduleModel.js");
const { allocateVariantCode } = require("./variant-code-allocation.service.js");
const { getVariantReferenceCounts } = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function getVariantDetails(id) {
  const variant = await RouteVariant.findById(id)
    .populate({ path: "corridorId", populate: [{ path: "originId" }, { path: "destinationId" }] })
    .populate("returnVariantId", "code name direction status revisionNumber")
    .populate("revisionOfVariantId", "code name status revisionNumber")
    .populate("supersededByVariantId", "code name revisionNumber status")
    .populate("createdBy", "name email")
    .lean();
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);

  // Scoped history: find other revisions belonging to this variant's route family / direction
  const corridorId = variant.corridorId?._id || variant.corridorId;
  const historyQueryConditions = [];
  if (variant.revisionOfVariantId) {
    const revOfId = variant.revisionOfVariantId._id || variant.revisionOfVariantId;
    historyQueryConditions.push({ _id: revOfId });
  }
  if (variant.supersededByVariantId) {
    const supById = variant.supersededByVariantId._id || variant.supersededByVariantId;
    historyQueryConditions.push({ _id: supById });
  }
  if (variant.routeFamilyId) {
    historyQueryConditions.push({ routeFamilyId: variant.routeFamilyId, direction: variant.direction });
  }
  if (corridorId) {
    historyQueryConditions.push({
      corridorId,
      direction: variant.direction,
      status: { $in: ["INACTIVE", "ARCHIVED"] },
    });
  }

  const familyFilter = {
    _id: { $ne: variant._id },
    status: { $ne: "ACTIVE" },
    ...(historyQueryConditions.length > 0 ? { $or: historyQueryConditions } : {}),
  };

  const [stops, references, historyVariants, operatorConfigs, fleetSetups, schedules] = await Promise.all([
    RouteStop.find({ variantId: id }).populate("stopId", "name code type province district municipality coordinates").sort({ sequence: 1 }).lean(),
    getVariantReferenceCounts(id),
    RouteVariant.find(familyFilter)
      .sort({ revisionNumber: -1, createdAt: -1 })
      .populate("createdBy", "name email")
      .populate("supersededByVariantId", "code name revisionNumber")
      .lean(),
    OperatorRouteConfig.find({ variantId: id }).populate("brandId", "brandName brandCode logo contactPhone baseCity").lean(),
    FleetRouteSetup.find({ $or: [{ variantId: id }, { returnVariantId: id }] })
      .populate("brandId", "brandName brandCode logo")
      .populate("fleetId", "busNumber name status")
      .lean(),
    Schedule.find({ variantId: id, status: "ACTIVE" }).select("_id scheduleCode operatorId status").lean(),
  ]);

  // Aggregate stop counts for historical revisions
  const historyIds = historyVariants.map((h) => h._id);
  const stopCountAgg = historyIds.length
    ? await RouteStop.aggregate([
        { $match: { variantId: { $in: historyIds } } },
        { $group: { _id: "$variantId", count: { $sum: 1 } } },
      ])
    : [];
  const stopCountMap = Object.fromEntries(stopCountAgg.map((s) => [String(s._id), s.count]));

  const revisionHistory = historyVariants.map((h) => ({
    ...h,
    stopCount: stopCountMap[String(h._id)] || 0,
  }));

  // Build list of referencing operator brands and fleets
  const brandMap = new Map();
  operatorConfigs.forEach((cfg) => {
    if (cfg.brandId?._id) {
      const bId = String(cfg.brandId._id);
      if (!brandMap.has(bId)) {
        brandMap.set(bId, {
          _id: cfg.brandId._id,
          brandName: cfg.brandId.brandName,
          brandCode: cfg.brandId.brandCode,
          logo: cfg.brandId.logo,
          contactPhone: cfg.brandId.contactPhone,
          buses: [],
        });
      }
    }
  });

  fleetSetups.forEach((fs) => {
    if (fs.brandId?._id) {
      const bId = String(fs.brandId._id);
      if (!brandMap.has(bId)) {
        brandMap.set(bId, {
          _id: fs.brandId._id,
          brandName: fs.brandId.brandName,
          brandCode: fs.brandId.brandCode,
          logo: fs.brandId.logo,
          buses: [],
        });
      }
      if (fs.fleetId) {
        brandMap.get(bId).buses.push({
          _id: fs.fleetId._id,
          busNumber: fs.fleetId.busNumber,
          name: fs.fleetId.name,
          status: fs.fleetId.status,
        });
      }
    }
  });

  return {
    variant,
    stops,
    references,
    referencingBrands: Array.from(brandMap.values()),
    activeScheduleCount: schedules.length,
    revisionHistory,
  };
}

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

module.exports = {
  createVariantRevision,
  getVariantDetails,
  rollbackVariantRevision,
  deleteHistoricalRevision,
};

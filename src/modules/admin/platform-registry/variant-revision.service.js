"use strict";

const mongoose = require("mongoose");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { allocateVariantCode } = require("./variant-code-allocation.service.js");
const { getVariantReferenceCounts } = require("./variant-reference.policy.js");
const { routeVariantError } = require("./route-variant-errors.js");

async function getVariantDetails(id) {
  const variant = await RouteVariant.findById(id)
    .populate({ path: "corridorId", populate: [{ path: "originId" }, { path: "destinationId" }] })
    .populate("returnVariantId", "code name direction status revisionNumber")
    .populate("revisionOfVariantId", "code name status revisionNumber")
    .lean();
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  const [stops, references] = await Promise.all([
    RouteStop.find({ variantId: id }).populate("stopId", "name code type province district municipality coordinates").sort({ sequence: 1 }).lean(),
    getVariantReferenceCounts(id),
  ]);
  return { variant, stops, references };
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
  if (includeCompanion && source.returnVariantId) {
    const companionSource = await RouteVariant.findById(source.returnVariantId);
    if (companionSource && ['ACTIVE', 'INACTIVE'].includes(companionSource.status)) {
      const companionRevision = await cloneOne(companionSource, routeFamilyId, adminId);
      revision.returnVariantId = companionRevision._id;
      companionRevision.returnVariantId = revision._id;
      await Promise.all([revision.save(), companionRevision.save()]);
    }
  }
  return getVariantDetails(revision._id);
}

module.exports = { createVariantRevision, getVariantDetails };

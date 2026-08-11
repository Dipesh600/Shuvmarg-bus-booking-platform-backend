"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const RouteStop = require("../../../../../models/routeStopModel.js");
const { setVariantStops } = require("../route-stop-sequence.service.js");
const { routeVariantError } = require("../route-variant-errors.js");
const {
  getVariantOperationalReferenceCounts, hasOperationalReferences,
} = require("../variant-reference.policy.js");
const { runVariantWrite } = require("../variant-write-transaction.service.js");
const { getVariantDraft, loadDraftVariant, loadMapReview } = require("./context.service.js");
const { assertCandidatesReady, buildRouteStopSequence, resolveCommittedStops } = require("./commit-policy.service.js");

async function loadCommittableDraft(variantId, session = null) {
  const variant = await loadDraftVariant(variantId);
  if (!String(variant.name || "").trim()) {
    throw routeVariantError("VARIANT_NAME_REQUIRED", "Give this route variant a clear path name before saving stops.");
  }
  const review = await loadMapReview(variant._id);
  if (!review || new Date(review.expiresAt) <= new Date()) {
    throw routeVariantError("MAP_REVIEW_EXPIRED", "The temporary map review has expired. Load it again before saving.", 410);
  }
  let query = RouteVariantStopCandidate.find({ variantId: variant._id, mapReviewId: review._id }).sort({ sequence: 1 });
  if (session && typeof query.session === "function") query = query.session(session);
  const candidates = await query;
  const included = assertCandidatesReady(candidates, variant);
  return { variant, included };
}

async function writeCommittedDraft(variantId, adminId, session = null) {
  const { variant, included } = await loadCommittableDraft(variantId, session);
  const stops = await resolveCommittedStops(included, adminId, { session });
  const terminalUpdate = (!variant.originTerminalStopId && !variant.destinationTerminalStopId)
    ? {
        originTerminalStopId: stops[0]._id,
        destinationTerminalStopId: stops.at(-1)._id,
      }
    : {};
  await RouteVariant.findByIdAndUpdate(
    variant._id, { ...terminalUpdate, updatedBy: adminId || null }, session ? { session } : undefined
  );
  await setVariantStops(variant._id, buildRouteStopSequence(included, stops), { session });
  await deriveCompanionSequence(variant, stops, included, adminId, session);
}

async function deriveCompanionSequence(variant, stops, included, adminId, session) {
  if (!variant.returnVariantId) return;
  let companionQuery = RouteVariant.findById(variant.returnVariantId);
  if (session && typeof companionQuery.session === "function") companionQuery = companionQuery.session(session);
  const companion = await companionQuery;
  if (!companion || companion.status !== "DRAFT") return;
  let countQuery = RouteStop.countDocuments({ variantId: companion._id });
  if (session && typeof countQuery.session === "function") countQuery = countQuery.session(session);
  if (await countQuery) return;
  const totalDistance = included.at(-1).distanceFromOriginMeters || 0;
  const totalDuration = included.at(-1).durationFromOriginSeconds || 0;
  const reversedStops = [...stops].reverse();
  const reversedCandidates = [...included].reverse();
  companion.originTerminalStopId = reversedStops[0]._id;
  companion.destinationTerminalStopId = reversedStops.at(-1)._id;
  companion.name = variant.name;
  companion.type = variant.type;
  companion.distanceKm = totalDistance ? Math.round(totalDistance / 100) / 10 : variant.distanceKm;
  companion.durationMinutes = totalDuration ? Math.round(totalDuration / 60) : variant.durationMinutes;
  companion.updatedBy = adminId || null;
  await companion.save(session ? { session } : undefined);
  await setVariantStops(companion._id, reversedCandidates.map((candidate, index) => ({
    stopCode: reversedStops[index].code,
    sequence: index + 1,
    isMajor: candidate.isTerminal,
    distanceFromOriginKm: Number.isFinite(candidate.distanceFromOriginMeters)
      ? Math.round((totalDistance - candidate.distanceFromOriginMeters) / 100) / 10 : null,
    durationFromOriginMins: Number.isFinite(candidate.durationFromOriginSeconds)
      ? Math.round((totalDuration - candidate.durationFromOriginSeconds) / 60) : 0,
  })), { session });
}

async function commitVariantDraft(variantId, adminId, dependencies = {}) {
  await runVariantWrite({
    mongooseImpl: dependencies.mongoose,
    // Transactions keep newly created canonical Stops, candidate resolutions,
    // and the RouteStop sequence all-or-nothing on replica-set deployments.
    transactionWork: (session) => writeCommittedDraft(variantId, adminId, session),
    // A standalone development MongoDB cannot transact. In that case a newly
    // created Stop is first retained on its candidate; if sequence persistence
    // fails, a later retry reuses that exact Stop rather than duplicating it.
    fallbackWork: () => writeCommittedDraft(variantId, adminId),
  });
  return getVariantDraft(variantId, { includeRouteGeometry: true });
}

async function activateVariantDraft(variantId, adminId) {
  const variant = await loadDraftVariant(variantId);
  const { updateVariant } = require("../route-variant-registry.service.js");
  let source = null;
  if (variant.revisionOfVariantId) {
    source = await RouteVariant.findById(variant.revisionOfVariantId);
    if (source?.status === "ACTIVE") {
      const counts = await getVariantOperationalReferenceCounts(source._id);
      if (hasOperationalReferences(counts)) {
        throw routeVariantError(
          "VARIANT_REVISION_MIGRATION_REQUIRED",
          "This revision cannot replace the live path until its active fleet route configurations, schedules, agent access and future trips are migrated.",
          409, counts
        );
      }
    }
  }
  const activated = await updateVariant(variant._id, { status: "ACTIVE" }, adminId);
  if (source?.status === "ACTIVE") {
    source.status = "INACTIVE";
    source.supersededByVariantId = activated._id;
    source.updatedBy = adminId || null;
    await source.save();
  }
  return activated;
}

module.exports = { activateVariantDraft, commitVariantDraft };

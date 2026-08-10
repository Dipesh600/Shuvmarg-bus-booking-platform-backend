"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const { setVariantStops } = require("../route-stop-sequence.service.js");
const { routeVariantError } = require("../route-variant-errors.js");
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
  return updateVariant(variant._id, { status: "ACTIVE" }, adminId);
}

module.exports = { activateVariantDraft, commitVariantDraft };

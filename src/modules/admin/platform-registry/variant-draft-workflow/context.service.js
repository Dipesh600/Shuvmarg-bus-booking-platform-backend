"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const RouteVariantMapReview = require("../../../../../models/routeVariantMapReviewModel.js");
const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { assertObjectId } = require("./shared.js");
const { mapVariantDraft } = require("../variant-draft-workflow.mapper.js");

// Keep capability fields in this shared projection. Candidate review reuses it
// both for display population and for enforcing that an existing Stop is an
// active, verified operational route stop.
const STOP_REFERENCE_FIELDS = [
  "_id", "code", "name", "type", "province", "district", "municipality",
  "coordinates", "status", "verificationStatus", "isRouteStop",
].join(" ");

async function loadDraftVariant(variantId) {
  assertObjectId(variantId, "INVALID_VARIANT_ID", "Variant ID");
  const variant = await RouteVariant.findById(variantId)
    .populate("originTerminalStopId", STOP_REFERENCE_FIELDS)
    .populate("destinationTerminalStopId", STOP_REFERENCE_FIELDS).lean();
  if (!variant) throw routeVariantError("VARIANT_NOT_FOUND", "Route variant not found.", 404);
  if (variant.status !== "DRAFT") {
    throw routeVariantError("VARIANT_DRAFT_REQUIRED", "This action is available only while the variant is a draft.", 409);
  }
  return variant;
}

function loadMapReview(variantId, rawRouteOptions = false) {
  let query = RouteVariantMapReview.findOne({ variantId });
  if (rawRouteOptions) query = query.select("+routeOptions.encodedPolyline");
  return query.lean();
}

function loadCandidates(mapReviewId) {
  if (!mapReviewId) return [];
  return RouteVariantStopCandidate.find({ mapReviewId })
    .select("+providerSnapshot.displayName +providerSnapshot.formattedAddress +providerSnapshot.placeId")
    .populate("matchedStopId", STOP_REFERENCE_FIELDS)
    .populate("resolvedStopId", STOP_REFERENCE_FIELDS)
    .populate("classification.suggestedParentStopId", STOP_REFERENCE_FIELDS)
    .sort({ sequence: 1 }).lean();
}

async function getVariantDraft(variantId, options = {}) {
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id, options.includeRouteGeometry === true);
  const candidates = await loadCandidates(review?._id);
  const draft = mapVariantDraft({ variant, review, candidates, warnings: options.warnings || [] });
  draft.stopCandidates = draft.candidates.map((candidate) => ({ ...candidate, coords: candidate.coordinates }));
  return draft;
}

module.exports = { STOP_REFERENCE_FIELDS, getVariantDraft, loadCandidates, loadDraftVariant, loadMapReview };

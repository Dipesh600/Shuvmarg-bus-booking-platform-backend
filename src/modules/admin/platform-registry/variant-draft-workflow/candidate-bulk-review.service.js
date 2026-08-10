"use strict";

const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { getVariantDraft, loadDraftVariant, loadMapReview } = require("./context.service.js");
const { resolveEligibleStop } = require("./candidate-policy.service.js");

function isSafeBulkExistingCandidate(candidate) {
  return !candidate.isTerminal && candidate.reviewStatus === "UNREVIEWED" &&
    candidate.classification?.entityType === "ROUTE_STOP" &&
    candidate.classification?.confidence === "HIGH" && Boolean(candidate.matchedStopId);
}

async function useAllMatchedVariantDraftCandidates(variantId) {
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id);
  if (!review || new Date(review.expiresAt) <= new Date()) {
    throw routeVariantError(
      "MAP_REVIEW_EXPIRED",
      "The temporary map review has expired. Load road-route suggestions again.",
      410
    );
  }

  const candidates = await RouteVariantStopCandidate.find({
    variantId: variant._id,
    mapReviewId: review._id,
    reviewStatus: "UNREVIEWED",
    matchedStopId: { $ne: null },
  });
  const safeCandidates = candidates.filter(isSafeBulkExistingCandidate);

  // Validate every canonical Stop before writing any decision. This keeps the
  // shortcut equivalent to reviewing each match through the normal policy.
  for (const candidate of safeCandidates) {
    await resolveEligibleStop(candidate.matchedStopId, candidate.coordinates);
  }
  if (safeCandidates.length) {
    await RouteVariantStopCandidate.bulkWrite(safeCandidates.map((candidate) => ({
      updateOne: {
        filter: { _id: candidate._id, reviewStatus: "UNREVIEWED" },
        update: {
          $set: { reviewStatus: "USE_EXISTING", resolvedStopId: candidate.matchedStopId },
          $unset: { proposedStop: 1 },
        },
      },
    })));
  }
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

module.exports = { isSafeBulkExistingCandidate, useAllMatchedVariantDraftCandidates };

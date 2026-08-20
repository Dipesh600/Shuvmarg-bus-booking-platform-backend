"use strict";

const { decodePolyline } = require("../route-geometry/polyline.js");
const {
  getSelectedProviderRouteOption, replaceMapReviewCandidates,
} = require("../variant-map-review/route-variant-map-review.service.js");
const { buildRouteStopCandidates } = require("../variant-map-review/route-stop-candidate.service.js");
const { getCorridorById } = require("../corridor-registry.service.js");
const {
  resolveDirectionalEndpoints,
} = require("../variant-terminal-scope.policy.js");
const { getVariantDraft, loadDraftVariant, loadMapReview } = require("./context.service.js");
const { routeVariantError } = require("../route-variant-errors.js");

async function resolveCandidateAnchors(variant) {
  const corridor = await getCorridorById(variant.corridorId);
  const { originEndpointId, destinationEndpointId } = resolveDirectionalEndpoints(
    corridor, variant.direction
  );
  return {
    originTerminal: variant.originTerminalStopId || null,
    destinationTerminal: variant.destinationTerminalStopId || null,
    originAnchor: variant.originTerminalStopId || originEndpointId,
    destinationAnchor: variant.destinationTerminalStopId || destinationEndpointId,
  };
}

async function prepareVariantDraftStopCandidates(variantId) {
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id, true);
  if (!review) throw routeVariantError("MAP_REVIEW_NOT_READY", "Load and select a road-route suggestion first.", 409);
  const selected = await getSelectedProviderRouteOption(review._id);
  const anchors = await resolveCandidateAnchors(variant);
  const result = await buildRouteStopCandidates({
    ...anchors,
    selectedRouteOption: selected,
    polyline: decodePolyline(selected.encodedPolyline),
  });
  await replaceMapReviewCandidates(review._id, result.candidates);
  return getVariantDraft(variant._id, { includeRouteGeometry: true, warnings: result.warnings });
}

module.exports = { prepareVariantDraftStopCandidates };

"use strict";

const Stop = require("../../../../../models/stopModel.js");
const { decodePolyline } = require("../route-geometry/polyline.js");
const { locateOnRoute } = require("../route-geometry/route-position.js");
const { getSelectedProviderRouteOption, replaceMapReviewCandidates } = require("../variant-map-review/route-variant-map-review.service.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { getVariantDraft, loadCandidates, loadDraftVariant, loadMapReview } = require("./context.service.js");

async function addExistingStopCandidate(variantId, stopId) {
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id);
  if (!review) throw routeVariantError("MAP_REVIEW_NOT_READY", "Select a road path before adding a Stop.", 409);
  const [selected, candidates, stop] = await Promise.all([
    getSelectedProviderRouteOption(review._id), loadCandidates(review._id), Stop.findById(stopId).lean(),
  ]);
  if (!stop || stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" || stop.isRouteStop !== true) {
    throw routeVariantError("INVALID_ROUTE_STOP", "Choose an active, verified operational Stop.");
  }
  if (!Number.isFinite(stop.coordinates?.lat) || !Number.isFinite(stop.coordinates?.lng)) {
    throw routeVariantError("ROUTE_STOP_COORDINATES_REQUIRED", "The selected Stop needs a verified map position.", 409);
  }
  if (candidates.some((item) => String(item.resolvedStopId?._id || item.resolvedStopId) === String(stop._id))) {
    throw routeVariantError("DUPLICATE_ROUTE_STOP", "That Stop is already in this route review.", 409);
  }
  const position = locateOnRoute(stop.coordinates, decodePolyline(selected.encodedPolyline));
  if (!position || position.offRouteKm > 5) {
    throw routeVariantError("ROUTE_STOP_TOO_FAR_FROM_PATH", "That Stop is more than 5 km from the selected road path.", 409, { distanceToRouteKm: position?.offRouteKm ?? null });
  }
  const ratio = selected.distanceMeters ? Math.min(1, position.distanceAlongKm * 1000 / selected.distanceMeters) : 0;
  const added = {
    providerSnapshot: { provider: "PLATFORM_STOP", displayName: stop.name, formattedAddress: [stop.municipality, stop.district, stop.province].filter(Boolean).join(", "), discoveryMethod: "CANONICAL_REGISTRY" },
    classification: { entityType: "ROUTE_STOP", confidence: "HIGH", reasonCodes: ["CANONICAL_VERIFIED_ROUTE_STOP"], distanceToRouteMeters: Math.round(position.offRouteKm * 1000) },
    coordinates: stop.coordinates, distanceFromOriginMeters: Math.round(position.distanceAlongKm * 1000), durationFromOriginSeconds: Math.round(selected.durationSeconds * ratio),
    reviewStatus: "USE_EXISTING", matchedStopId: stop._id, resolvedStopId: stop._id, isTerminal: false,
  };
  const writes = [...candidates.map((item) => ({ ...item, matchedStopId: item.matchedStopId?._id || item.matchedStopId, resolvedStopId: item.resolvedStopId?._id || item.resolvedStopId })), added]
    .sort((left, right) => (left.distanceFromOriginMeters || 0) - (right.distanceFromOriginMeters || 0))
    .map((item, index) => ({ ...item, sequence: index + 1 }));
  await replaceMapReviewCandidates(review._id, writes);
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

module.exports = { addExistingStopCandidate };

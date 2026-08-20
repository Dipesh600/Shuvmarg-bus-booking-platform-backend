"use strict";

const RouteCorridor = require("../../../../../models/routeCorridorModel.js");
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const RouteVariantMapReview = require("../../../../../models/routeVariantMapReviewModel.js");
const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const { corridorError } = require("../../../../domain/corridor/corridor-errors.js");
const { assertVariantTerminalScope } = require("../variant-terminal-scope.policy.js");
const {
  buildCandidateWrites,
  buildProviderRouteOptions,
} = require("./variant-map-review.validation.js");
const { replaceReview, replaceReviewCandidates, selectReviewRoute } =
  require("./route-variant-map-review.persistence.js");
const { CANDIDATE_ENGINE_VERSION, ROUTE_DATA_VERSION } =
  require("./route-variant-map-review.versions.js");

const DEFAULT_REVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function mapRouteOptionSummary(option) {
  return {
    optionKey: option.optionKey,
    providerRouteIndex: option.providerRouteIndex,
    distanceMeters: option.distanceMeters,
    durationSeconds: option.durationSeconds,
    ...(option.description && { description: option.description }),
    ...(option.roadLabels?.length && { roadLabels: option.roadLabels }),
  };
}

function buildReviewExpiry({ now = new Date(), ttlMs = DEFAULT_REVIEW_TTL_MS } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_REVIEW_TTL_MS) {
    throw corridorError("INVALID_MAP_ROUTE_REVIEW", "Review expiry must be within 30 days.");
  }
  return new Date(now.getTime() + ttlMs);
}

async function loadDraftContext(variantId, {
  RouteVariantModel = RouteVariant, RouteCorridorModel = RouteCorridor,
} = {}) {
  const variant = await RouteVariantModel.findById(variantId).lean();
  if (!variant) throw corridorError("ROUTE_VARIANT_NOT_FOUND", "Route variant was not found.", 404);
  if (variant.status !== "DRAFT") {
    throw corridorError("MAP_REVIEW_REQUIRES_DRAFT_VARIANT", "Map review is available only for a draft variant.", 409);
  }
  const corridor = await RouteCorridorModel.findById(variant.corridorId).lean();
  if (!corridor) throw corridorError("CORRIDOR_NOT_FOUND", "The variant corridor was not found.", 404);
  return { variant, corridor };
}

async function createOrReplaceMapReview(input, adminId, dependencies = {}) {
  const { variant, corridor } = await loadDraftContext(input.variantId, dependencies);
  if (variant.originTerminalStopId || variant.destinationTerminalStopId) {
    await assertVariantTerminalScope({
      corridor,
      direction: variant.direction,
      originTerminalStopId: variant.originTerminalStopId,
      destinationTerminalStopId: variant.destinationTerminalStopId,
      StopModel: dependencies.StopModel,
    });
  }
  const expiresAt = buildReviewExpiry(dependencies);
  const reviewPayload = {
    provider: "GOOGLE_ROUTES",
    routeOptions: buildProviderRouteOptions(input.providerRouteOptions),
    selectedRouteOptionKey: null,
    reviewStatus: "OPTIONS_READY",
    routeDataVersion: ROUTE_DATA_VERSION,
    candidateEngineVersion: null,
    expiresAt,
    refreshedBy: adminId || null,
  };
  const MapReviewModel = dependencies.MapReviewModel || RouteVariantMapReview;
  const CandidateModel = dependencies.CandidateModel || RouteVariantStopCandidate;
  return replaceReview({
    MapReviewModel, CandidateModel, variantId: variant._id,
    payload: reviewPayload, createdBy: adminId || null,
    mongooseImpl: dependencies.mongoose,
  });
}
async function selectMapReviewRouteOption(mapReviewId, routeOptionKey, dependencies = {}) {
  const MapReviewModel = dependencies.MapReviewModel || RouteVariantMapReview;
  const CandidateModel = dependencies.CandidateModel || RouteVariantStopCandidate;
  const review = await MapReviewModel.findById(mapReviewId).lean();
  const now = dependencies.now || new Date();
  if (!review || new Date(review.expiresAt) <= now) {
    throw corridorError("MAP_REVIEW_EXPIRED", "The route-map review has expired. Select a route again.", 410);
  }
  const selectedRouteOption = review.routeOptions.find(
    (option) => option.optionKey === routeOptionKey
  );
  if (!selectedRouteOption) {
    throw corridorError("ROUTE_OPTION_NOT_FOUND", "The selected route option is not part of this review.", 404);
  }
  await selectReviewRoute({
    MapReviewModel, CandidateModel, review, selectedRouteOption,
    mongooseImpl: dependencies.mongoose,
  });
  return mapRouteOptionSummary(selectedRouteOption);
}

async function getSelectedProviderRouteOption(mapReviewId, dependencies = {}) {
  const MapReviewModel = dependencies.MapReviewModel || RouteVariantMapReview;
  const review = await MapReviewModel.findById(mapReviewId)
    .select("+routeOptions.encodedPolyline").lean();
  if (!review || new Date(review.expiresAt) <= (dependencies.now || new Date())) {
    throw corridorError("MAP_REVIEW_EXPIRED", "The route-map review has expired. Select a route again.", 410);
  }
  const selectedRouteOption = review.routeOptions.find(
    (option) => option.optionKey === review.selectedRouteOptionKey
  );
  if (!selectedRouteOption) {
    throw corridorError("MAP_REVIEW_ROUTE_NOT_SELECTED", "Select a route option before reviewing stops.", 409);
  }
  return selectedRouteOption;
}

async function replaceMapReviewCandidates(mapReviewId, candidates, dependencies = {}) {
  const MapReviewModel = dependencies.MapReviewModel || RouteVariantMapReview;
  const CandidateModel = dependencies.CandidateModel || RouteVariantStopCandidate;
  const review = await MapReviewModel.findById(mapReviewId).lean();
  if (!review || new Date(review.expiresAt) <= (dependencies.now || new Date())) {
    throw corridorError("MAP_REVIEW_EXPIRED", "The route-map review has expired. Select a route again.", 410);
  }
  if (!review.selectedRouteOptionKey) {
    throw corridorError("MAP_REVIEW_ROUTE_NOT_SELECTED", "Select a route option before reviewing stops.", 409);
  }
  const writes = buildCandidateWrites(candidates, {
    mapReviewId: review._id, variantId: review.variantId, expiresAt: review.expiresAt,
  });
  return replaceReviewCandidates({
    MapReviewModel, CandidateModel, review, writes,
    mongooseImpl: dependencies.mongoose,
  });
}

module.exports = {
  CANDIDATE_ENGINE_VERSION, DEFAULT_REVIEW_TTL_MS, MAX_REVIEW_TTL_MS,
  ROUTE_DATA_VERSION, buildReviewExpiry,
  createOrReplaceMapReview, getSelectedProviderRouteOption,
  mapRouteOptionSummary, replaceMapReviewCandidates, selectMapReviewRouteOption,
};

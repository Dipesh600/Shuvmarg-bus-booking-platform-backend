"use strict";

const RouteVariantStopCandidate = require("../../../../../models/routeVariantStopCandidateModel.js");
const Stop = require("../../../../../models/stopModel.js");
const { assertInteractiveMapSelection } = require("../../../../domain/stop/stop-map-selection.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { STOP_REFERENCE_FIELDS, loadDraftVariant, loadMapReview } = require("./context.service.js");
const { assertObjectId } = require("./shared.js");
const { metersBetween } = require("../variant-map-review/route-stop-candidate.geometry.js");

const MAX_EXISTING_STOP_DISTANCE_METERS = 750;

function hasCoordinates(value) {
  return Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
}

async function requireReviewCandidate(variantId, candidateId) {
  assertObjectId(candidateId, "INVALID_STOP_CANDIDATE_ID", "Stop candidate ID");
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id);
  if (!review || new Date(review.expiresAt) <= new Date()) {
    throw routeVariantError("MAP_REVIEW_EXPIRED", "The temporary map review has expired. Load road-route suggestions again.", 410);
  }
  const candidate = await RouteVariantStopCandidate.findOne({
    _id: candidateId, variantId: variant._id, mapReviewId: review._id,
  });
  if (!candidate) throw routeVariantError("STOP_CANDIDATE_NOT_FOUND", "Stop candidate not found.", 404);
  return { candidate, variant };
}

async function resolveEligibleStop(stopId, candidateCoordinates = null, options = {}) {
  assertObjectId(stopId, "INVALID_ROUTE_STOP", "Route stop ID");
  let query = Stop.findById(stopId).select(STOP_REFERENCE_FIELDS);
  if (options.session && typeof query.session === "function") {
    query = query.session(options.session);
  }
  const stop = await query;
  if (!stop) throw routeVariantError("ROUTE_STOP_NOT_FOUND", "The selected registry stop was not found.", 404);
  if (stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" || !stop.isRouteStop) {
    throw routeVariantError("INVALID_ROUTE_STOP", "Use an active, verified operational route stop.");
  }
  if (candidateCoordinates && (!hasCoordinates(candidateCoordinates) || !hasCoordinates(stop.coordinates))) {
    throw routeVariantError(
      "ROUTE_STOP_COORDINATES_REQUIRED",
      "The reviewed location and selected route stop both need valid map positions.",
      409
    );
  }
  if (candidateCoordinates) {
    const distanceMeters = metersBetween(candidateCoordinates, stop.coordinates);
    if (distanceMeters > MAX_EXISTING_STOP_DISTANCE_METERS) {
      throw routeVariantError(
        "ROUTE_STOP_OUTSIDE_CANDIDATE_AREA",
        "Choose a canonical route stop near the reviewed map location.",
        409,
        { maxDistanceMeters: MAX_EXISTING_STOP_DISTANCE_METERS, distanceMeters: Math.round(distanceMeters) }
      );
    }
  }
  return stop;
}

async function resolveEligibleStops(requests, options = {}) {
  if (requests.length === 0) return [];
  const ids = requests.map(({ stopId }) => {
    assertObjectId(stopId, "INVALID_ROUTE_STOP", "Route stop ID");
    return stopId;
  });
  let query = Stop.find({ _id: { $in: [...new Set(ids.map(String))] } })
    .select(STOP_REFERENCE_FIELDS);
  if (options.session && typeof query.session === "function") query = query.session(options.session);
  const stops = await query;
  const byId = new Map(stops.map((stop) => [String(stop._id), stop]));
  return requests.map(({ stopId, coordinates }) => {
    const stop = byId.get(String(stopId));
    if (!stop) throw routeVariantError("ROUTE_STOP_NOT_FOUND", "The selected registry stop was not found.", 404);
    if (stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" || !stop.isRouteStop) {
      throw routeVariantError("INVALID_ROUTE_STOP", "Use an active, verified operational route stop.");
    }
    if (coordinates && (!hasCoordinates(coordinates) || !hasCoordinates(stop.coordinates))) {
      throw routeVariantError("ROUTE_STOP_COORDINATES_REQUIRED", "Reviewed Stops need valid map positions.", 409);
    }
    if (coordinates && metersBetween(coordinates, stop.coordinates) > MAX_EXISTING_STOP_DISTANCE_METERS) {
      throw routeVariantError("ROUTE_STOP_OUTSIDE_CANDIDATE_AREA", "Choose a canonical Stop near the reviewed map location.", 409);
    }
    return stop;
  });
}

function normalizeProposedStop(input, fallbackCoordinates) {
  const source = input && typeof input === "object" ? input : {};
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) throw routeVariantError("PROPOSED_STOP_NAME_REQUIRED", "A new canonical stop needs a name.");
  const normalized = {
    name,
    code: typeof source.code === "string" && source.code.trim() ? source.code.trim().toUpperCase() : null,
    type: source.type || "HIGHWAY_STOP", province: source.province || null,
    district: source.district || null, municipality: source.municipality || null,
    parentStopId: source.parentStopId || null, isSearchable: source.isSearchable !== false,
    coordinates: source.coordinates || fallbackCoordinates,
    coordinateSource: source.coordinateSource,
    coordinateProvider: source.coordinateProvider || null,
    coordinatePlaceId: source.coordinatePlaceId || null,
    coordinateSuggestedAddress: source.coordinateSuggestedAddress || null,
  };
  try {
    assertInteractiveMapSelection(normalized);
  } catch (error) {
    throw routeVariantError(error.code || "INVALID_STOP_COORDINATES", error.message, error.statusCode || 400);
  }
  return normalized;
}

module.exports = {
  MAX_EXISTING_STOP_DISTANCE_METERS,
  normalizeProposedStop,
  requireReviewCandidate,
  resolveEligibleStop,
  resolveEligibleStops,
};

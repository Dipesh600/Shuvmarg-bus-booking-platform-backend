"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const { fetchGoogleRouteOptions } = require("../../../../../services/googleRoutesClient.js");
const { resolveGoogleGuidancePlaces } = require("../../../../../services/googleRouteGuidancePlaces.js");
const { getCorridorById } = require("../corridor-registry.service.js");
const { allocateVariantCode } = require("../variant-code-allocation.service.js");
const {
  assertVariantTerminalScope, resolveDirectionalEndpoints,
} = require("../variant-terminal-scope.policy.js");
const { routeVariantError } = require("../route-variant-errors.js");
const {
  createOrReplaceMapReview, selectMapReviewRouteOption,
} = require("../variant-map-review/route-variant-map-review.service.js");
const { getVariantDraft, loadDraftVariant, loadMapReview } = require("./context.service.js");
const { assertObjectId, hasValidCoordinates, mapProviderOptions, validateDirection } = require("./shared.js");
const { resolveGuidanceStops } = require("./route-guidance.policy.js");

async function createVariantDraft(corridorId, data, adminId) {
  assertObjectId(corridorId, "INVALID_CORRIDOR_ID", "Corridor ID");
  const direction = validateDirection(data.direction);
  const corridor = await getCorridorById(corridorId);
  const hasOriginTerminal = Boolean(data.originTerminalStopId);
  const hasDestinationTerminal = Boolean(data.destinationTerminalStopId);
  if (hasOriginTerminal !== hasDestinationTerminal) {
    throw routeVariantError(
      "INCOMPLETE_VARIANT_TERMINALS",
      "Choose both physical terminals or leave both empty so they can be resolved during stop review."
    );
  }
  if (hasOriginTerminal) await assertVariantTerminalScope({ corridor, direction, ...data });
  const code = await allocateVariantCode(corridor._id, direction);
  const variant = await RouteVariant.create({
    code, corridorId: corridor._id, direction,
    originTerminalStopId: data.originTerminalStopId || null,
    destinationTerminalStopId: data.destinationTerminalStopId || null,
    definitionSource: "GOOGLE_ROUTE_REVIEW", status: "DRAFT",
    createdBy: adminId || null, updatedBy: adminId || null,
  });
  return getVariantDraft(variant._id);
}

async function resolveMapAnchors(variant) {
  if (variant.originTerminalStopId && variant.destinationTerminalStopId) {
    return {
      origin: variant.originTerminalStopId,
      destination: variant.destinationTerminalStopId,
      isTerminalAnchored: true,
    };
  }
  const corridor = await getCorridorById(variant.corridorId);
  const { originEndpointId, destinationEndpointId } = resolveDirectionalEndpoints(
    corridor, variant.direction
  );
  return {
    origin: originEndpointId,
    destination: destinationEndpointId,
    isTerminalAnchored: false,
  };
}

async function refreshVariantDraftRouteOptions(variantId, adminId, input = {}, dependencies = {}) {
  const variant = await loadDraftVariant(variantId);
  const { origin, destination, isTerminalAnchored } = await resolveMapAnchors(variant);
  if (!hasValidCoordinates(origin?.coordinates) || !hasValidCoordinates(destination?.coordinates)) {
    throw routeVariantError(
      isTerminalAnchored ? "VARIANT_TERMINAL_COORDINATES_REQUIRED" : "CORRIDOR_ENDPOINT_COORDINATES_REQUIRED",
      isTerminalAnchored
        ? "Both selected physical terminals need verified map positions before road routes can be suggested."
        : "Both corridor endpoints need map positions before Google road paths can be suggested.",
      409
    );
  }
  const guidanceStops = await resolveGuidanceStops(
    input.viaStopIds, { origin, destination }, dependencies.StopModel
  );
  let guidancePlaces = [];
  try {
    guidancePlaces = await (dependencies.resolveGoogleGuidancePlaces || resolveGoogleGuidancePlaces)(
      input.viaPlaceIds || []
    );
  } catch (error) {
    throw routeVariantError(
      "INVALID_ROUTE_GUIDANCE", error.message || "The selected Google guidance place is invalid."
    );
  }
  if (guidanceStops.length + guidancePlaces.length > 3) {
    throw routeVariantError("INVALID_ROUTE_GUIDANCE", "Choose no more than three total route guidance places.");
  }
  const guidance = [...guidanceStops, ...guidancePlaces];
  let options;
  try {
    const fetchRoutes = dependencies.fetchGoogleRouteOptions || fetchGoogleRouteOptions;
    const baseRoutes = await fetchRoutes(origin.coordinates, destination.coordinates);
    let providerRoutes = baseRoutes;
    if (guidance.length) {
      const guidedRoutes = await fetchRoutes(origin.coordinates, destination.coordinates, {
        via: guidance.map((place) => place.placeId ? { placeId: place.placeId } : place.coordinates),
      });
      const guidanceLabel = `Guided via ${guidance.map((place) => place.name).join(" / ")}`;
      providerRoutes = [
        ...baseRoutes,
        ...guidedRoutes.map((route) => ({ ...route, description: guidanceLabel, isGuided: true })),
      ].filter((route, index, routes) =>
        routes.findIndex((candidate) => candidate.polyline === route.polyline) === index
      );
    }
    options = mapProviderOptions(providerRoutes);
  } catch (error) {
    console.error("[variant-draft-workflow] Google route lookup failed", error);
    throw routeVariantError(
      "GOOGLE_ROUTE_LOOKUP_FAILED",
      "Road-route suggestions could not be loaded. Check the corridor endpoint map positions or try again shortly.",
      502
    );
  }
  await createOrReplaceMapReview({ variantId: variant._id, providerRouteOptions: options }, adminId, dependencies);
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

async function selectVariantDraftRouteOption(variantId, routeOptionId) {
  const variant = await loadDraftVariant(variantId);
  const review = await loadMapReview(variant._id);
  if (!review) throw routeVariantError("MAP_REVIEW_NOT_READY", "Load road-route suggestions before selecting one.", 409);
  await selectMapReviewRouteOption(review._id, routeOptionId);
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

async function updateVariantDraftDetails(variantId, data, adminId) {
  const variant = await loadDraftVariant(variantId);
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) throw routeVariantError("VARIANT_NAME_REQUIRED", "Give this route variant a clear path name.");
  if (data.type !== undefined && !["HIGHWAY", "MOUNTAIN", "EXPRESSWAY", "LOCAL", "STANDARD"].includes(data.type)) {
    throw routeVariantError("INVALID_VARIANT_TYPE", "Variant type is invalid.");
  }
  await RouteVariant.findByIdAndUpdate(variant._id, {
    name, ...(data.type !== undefined && { type: data.type }), updatedBy: adminId || null,
  }, { runValidators: true });
  return getVariantDraft(variant._id, { includeRouteGeometry: true });
}

module.exports = {
  createVariantDraft, refreshVariantDraftRouteOptions,
  selectVariantDraftRouteOption, updateVariantDraftDetails,
};

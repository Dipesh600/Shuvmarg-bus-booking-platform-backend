"use strict";

const RouteVariant = require("../../../../../models/routeVariantModel.js");
const Stop = require("../../../../../models/stopModel.js");
const { fetchGoogleRouteOptions } = require("../../../../../services/googleRoutesClient.js");
const { resolveGoogleGuidancePlaces } = require("../../../../../services/googleRouteGuidancePlaces.js");
const { getCorridorById } = require("../corridor-registry.service.js");
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
const { createPairedDrafts } = require("./draft-pair.service.js");

/**
 * Stateless route preview — fetches Google road-path suggestions for a corridor
 * without creating or modifying any draft. Used by the wizard's step-1 "Find Road
 * Paths" action so a draft record is only created once the operator proceeds to
 * stop discovery.
 */
async function previewCorridorRoutePaths(corridorId, data, dependencies = {}) {
  assertObjectId(corridorId, "INVALID_CORRIDOR_ID", "Corridor ID");
  const direction = validateDirection(data.direction);
  const corridor = await getCorridorById(corridorId);

  // Validate and resolve terminal stops if provided (parent-stop endpoints only).
  let terminals = { originTerminal: null, destinationTerminal: null };
  if (data.originTerminalStopId || data.destinationTerminalStopId) {
    terminals = await assertVariantTerminalScope({
      corridor, direction,
      originTerminalStopId: data.originTerminalStopId,
      destinationTerminalStopId: data.destinationTerminalStopId,
      StopModel: dependencies.StopModel || Stop,
    });
  }

  const { originEndpointId, destinationEndpointId } = resolveDirectionalEndpoints(corridor, direction);
  const StopModel = dependencies.StopModel || Stop;

  // Resolve origin map anchor: use the chosen terminal stop if provided, else
  // the corridor's own origin endpoint.
  async function resolveAnchor(terminalDoc, endpointRef) {
    if (terminalDoc?.coordinates && hasValidCoordinates(terminalDoc.coordinates)) return terminalDoc;
    const endpointId = endpointRef?._id || endpointRef;
    if (endpointRef?.coordinates && hasValidCoordinates(endpointRef.coordinates)) return endpointRef;
    if (endpointId) return StopModel.findById(endpointId).select("name coordinates").lean();
    return null;
  }

  const [origin, destination] = await Promise.all([
    resolveAnchor(terminals.originTerminal, originEndpointId),
    resolveAnchor(terminals.destinationTerminal, destinationEndpointId),
  ]);

  const isTerminalAnchored = Boolean(data.originTerminalStopId || data.destinationTerminalStopId);
  if (!hasValidCoordinates(origin?.coordinates) || !hasValidCoordinates(destination?.coordinates)) {
    throw routeVariantError(
      isTerminalAnchored ? "VARIANT_TERMINAL_COORDINATES_REQUIRED" : "CORRIDOR_ENDPOINT_COORDINATES_REQUIRED",
      isTerminalAnchored
        ? "The selected bus park needs a verified map position before road paths can be suggested."
        : "Both corridor endpoints need map positions before road paths can be suggested.",
      409
    );
  }

  let options;
  try {
    const fetchRoutes = dependencies.fetchGoogleRouteOptions || fetchGoogleRouteOptions;
    options = mapProviderOptions(await fetchRoutes(origin.coordinates, destination.coordinates));
  } catch (error) {
    console.error("[variant-draft-workflow] preview Google route lookup failed", error);
    throw routeVariantError(
      "GOOGLE_ROUTE_LOOKUP_FAILED",
      "Road-path suggestions could not be loaded. Check the corridor endpoint map positions or try again shortly.",
      502
    );
  }

  return {
    corridorId: String(corridor._id),
    direction,
    originStopId: String(origin._id || originEndpointId._id || originEndpointId),
    destinationStopId: String(destination._id || destinationEndpointId._id || destinationEndpointId),
    routeOptions: options.map((opt, i) => ({
      id: `preview-${i}`,
      label: opt.description || (i === 0 ? "Recommended road path" : `Alternative path ${i + 1}`),
      distanceKm: Math.round((opt.distanceMeters || 0) / 100) / 10,
      durationMinutes: Math.round((opt.durationSeconds || 0) / 60),
      encodedPolyline: opt.encodedPolyline || null,
      isRecommended: i === 0,
      roadLabels: opt.roadLabels || [],
      providerRouteIndex: opt.providerRouteIndex ?? i,
    })),
  };
}

async function createVariantDraft(corridorId, data, adminId, dependencies = {}) {
  assertObjectId(corridorId, "INVALID_CORRIDOR_ID", "Corridor ID");
  const direction = validateDirection(data.direction);
  const corridor = await getCorridorById(corridorId);
  if (data.originTerminalStopId || data.destinationTerminalStopId) {
    await assertVariantTerminalScope({ corridor, direction, ...data });
  }
  const variant = await createPairedDrafts({ corridor, direction, data, adminId });

  // If preview route options and selection were passed from the wizard,
  // set up the review, select the route, and discover stops in ONE atomic step.
  if (Array.isArray(data.routeOptions) && data.routeOptions.length > 0) {
    const rawOptions = data.routeOptions.map((opt, i) => ({
      providerRouteIndex: opt.providerRouteIndex ?? i,
      encodedPolyline: opt.encodedPolyline,
      distanceMeters: opt.distanceMeters || Math.round((opt.distanceKm || 0) * 1000),
      durationSeconds: opt.durationSeconds || Math.round((opt.durationMinutes || 0) * 60),
      description: opt.label || opt.description || undefined,
      roadLabels: opt.roadLabels || [],
    }));

    const review = await createOrReplaceMapReview(
      { variantId: variant._id, providerRouteOptions: rawOptions },
      adminId, dependencies
    );

    const selectedIndex = data.selectedProviderRouteIndex ?? 0;
    const selectedOption = review.routeOptions.find(
      (opt) => opt.providerRouteIndex === selectedIndex
    ) || review.routeOptions[0];

    if (selectedOption) {
      await selectMapReviewRouteOption(review._id, selectedOption.optionKey);
      const { prepareVariantDraftStopCandidates } = require("./candidate-preparation.service.js");
      return prepareVariantDraftStopCandidates(variant._id);
    }
  }

  return getVariantDraft(variant._id);
}

async function resolveMapAnchors(variant, StopModel = Stop) {
  const corridor = await getCorridorById(variant.corridorId);
  const { originEndpointId, destinationEndpointId } = resolveDirectionalEndpoints(
    corridor, variant.direction
  );

  let origin = variant.originTerminalStopId;
  if (!origin?.coordinates) {
    const originId = origin?._id || origin || originEndpointId?._id || originEndpointId;
    if (originEndpointId?.coordinates && String(originEndpointId._id) === String(originId)) {
      origin = originEndpointId;
    } else if (originId) {
      origin = await StopModel.findById(originId).select("name code municipality district coordinates").lean();
    }
  }

  let destination = variant.destinationTerminalStopId;
  if (!destination?.coordinates) {
    const destinationId = destination?._id || destination || destinationEndpointId?._id || destinationEndpointId;
    if (destinationEndpointId?.coordinates && String(destinationEndpointId._id) === String(destinationId)) {
      destination = destinationEndpointId;
    } else if (destinationId) {
      destination = await StopModel.findById(destinationId).select("name code municipality district coordinates").lean();
    }
  }

  const isTerminalAnchored = Boolean(variant.originTerminalStopId || variant.destinationTerminalStopId);
  return {
    origin,
    destination,
    isTerminalAnchored,
  };
}

async function refreshVariantDraftRouteOptions(variantId, adminId, input = {}, dependencies = {}) {
  const StopModel = dependencies.StopModel || Stop;
  const variant = await loadDraftVariant(variantId);
  const { origin, destination, isTerminalAnchored } = await resolveMapAnchors(variant, StopModel);
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
  createVariantDraft, previewCorridorRoutePaths,
  refreshVariantDraftRouteOptions,
  selectVariantDraftRouteOption, updateVariantDraftDetails,
};

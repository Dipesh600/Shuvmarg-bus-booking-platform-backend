"use strict";
const Stop = require("../../../../../models/stopModel.js");
const { fetchGoogleRouteOptions } = require("../../../../../services/googleRoutesClient.js");
const { getCorridorById } = require("../corridor-registry.service.js");
const { assertVariantTerminalScope, resolveDirectionalEndpoints } = require("../variant-terminal-scope.policy.js");
const { routeVariantError } = require("../route-variant-errors.js");
const { assertObjectId, hasValidCoordinates, mapProviderOptions, validateDirection } = require("./shared.js");

async function resolveAnchor(StopModel, terminal, endpoint) {
  if (terminal?.coordinates && hasValidCoordinates(terminal.coordinates)) return terminal;
  if (endpoint?.coordinates && hasValidCoordinates(endpoint.coordinates)) return endpoint;
  const id = endpoint?._id || endpoint;
  return id ? StopModel.findById(id).select("name coordinates").lean() : null;
}

async function previewCorridorRoutePaths(corridorId, data, dependencies = {}) {
  assertObjectId(corridorId, "INVALID_CORRIDOR_ID", "Corridor ID");
  const direction = validateDirection(data.direction);
  const corridor = await getCorridorById(corridorId);
  let terminals = { originTerminal: null, destinationTerminal: null };
  if (data.originTerminalStopId || data.destinationTerminalStopId) {
    terminals = await assertVariantTerminalScope({ corridor, direction,
      originTerminalStopId: data.originTerminalStopId, destinationTerminalStopId: data.destinationTerminalStopId,
      StopModel: dependencies.StopModel || Stop });
  }
  const endpoints = resolveDirectionalEndpoints(corridor, direction);
  const StopModel = dependencies.StopModel || Stop;
  const [origin, destination] = await Promise.all([
    resolveAnchor(StopModel, terminals.originTerminal, endpoints.originEndpointId),
    resolveAnchor(StopModel, terminals.destinationTerminal, endpoints.destinationEndpointId),
  ]);
  const terminalAnchored = Boolean(data.originTerminalStopId || data.destinationTerminalStopId);
  if (!hasValidCoordinates(origin?.coordinates) || !hasValidCoordinates(destination?.coordinates)) {
    throw routeVariantError(terminalAnchored ? "VARIANT_TERMINAL_COORDINATES_REQUIRED" : "CORRIDOR_ENDPOINT_COORDINATES_REQUIRED",
      terminalAnchored ? "The selected bus park needs a verified map position before road paths can be suggested."
        : "Both corridor endpoints need map positions before road paths can be suggested.", 409);
  }
  let options;
  try {
    options = mapProviderOptions(await (dependencies.fetchGoogleRouteOptions || fetchGoogleRouteOptions)(origin.coordinates, destination.coordinates));
  } catch (error) {
    console.error("[variant-draft-workflow] preview Google route lookup failed", error);
    throw routeVariantError("GOOGLE_ROUTE_LOOKUP_FAILED", "Road-path suggestions could not be loaded. Check the corridor endpoint map positions or try again shortly.", 502);
  }
  return { corridorId: String(corridor._id), direction,
    originStopId: String(origin._id || endpoints.originEndpointId._id || endpoints.originEndpointId),
    destinationStopId: String(destination._id || endpoints.destinationEndpointId._id || endpoints.destinationEndpointId),
    routeOptions: options.map((option, index) => ({ id: `preview-${index}`,
      label: option.description || (index === 0 ? "Recommended road path" : `Alternative path ${index + 1}`),
      distanceKm: Math.round((option.distanceMeters || 0) / 100) / 10,
      durationMinutes: Math.round((option.durationSeconds || 0) / 60), encodedPolyline: option.encodedPolyline || null,
      isRecommended: index === 0, roadLabels: option.roadLabels || [], providerRouteIndex: option.providerRouteIndex ?? index })) };
}
module.exports = { previewCorridorRoutePaths };

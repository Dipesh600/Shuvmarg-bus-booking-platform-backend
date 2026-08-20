"use strict";
const Stop = require("../../../../../models/stopModel.js");
const { getCorridorById } = require("../corridor-registry.service.js");
const { resolveDirectionalEndpoints } = require("../variant-terminal-scope.policy.js");

async function resolveOne(current, endpoint, StopModel) {
  if (current?.coordinates) return current;
  const id = current?._id || current || endpoint?._id || endpoint;
  if (endpoint?.coordinates && String(endpoint._id) === String(id)) return endpoint;
  return id ? StopModel.findById(id).select("name code municipality district coordinates").lean() : null;
}

async function resolveMapAnchors(variant, StopModel = Stop) {
  const corridor = await getCorridorById(variant.corridorId);
  const endpoints = resolveDirectionalEndpoints(corridor, variant.direction);
  const [origin, destination] = await Promise.all([
    resolveOne(variant.originTerminalStopId, endpoints.originEndpointId, StopModel),
    resolveOne(variant.destinationTerminalStopId, endpoints.destinationEndpointId, StopModel),
  ]);
  return { origin, destination,
    isTerminalAnchored: Boolean(variant.originTerminalStopId || variant.destinationTerminalStopId) };
}
module.exports = { resolveMapAnchors };

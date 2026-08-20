"use strict";

const Stop = require("../../../../models/stopModel.js");
const { corridorError } = require("../../../domain/corridor/corridor-errors.js");

const TERMINAL_FIELDS = "_id name code parentStopId status verificationStatus isRouteStop municipality district coordinates";

function idOf(value) {
  return value && String(value._id || value);
}

function sameId(left, right) {
  return Boolean(left && right && idOf(left) === idOf(right));
}

function resolveDirectionalEndpoints(corridor, direction) {
  if (!corridor?.originId || !corridor?.destinationId) {
    throw corridorError(
      "INVALID_CORRIDOR_ENDPOINT",
      "A variant requires a corridor with both endpoints."
    );
  }
  if (!["FORWARD", "RETURN"].includes(direction)) {
    throw corridorError(
      "INVALID_VARIANT_DIRECTION", "Variant direction must be FORWARD or RETURN."
    );
  }
  return direction === "RETURN"
    ? { originEndpointId: corridor.destinationId, destinationEndpointId: corridor.originId }
    : { originEndpointId: corridor.originId, destinationEndpointId: corridor.destinationId };
}

async function loadStop(stopId, StopModel, session = null) {
  let query = StopModel.findById(stopId).select(TERMINAL_FIELDS);
  if (session && typeof query.session === "function") query = query.session(session);
  return query.lean();
}

async function assertTerminalWithinEndpointScope({
  endpointId, terminalStopId, label, StopModel = Stop, session = null,
}) {
  const terminal = await loadStop(terminalStopId, StopModel, session);
  if (!terminal) {
    throw corridorError("VARIANT_TERMINAL_NOT_FOUND", `${label} terminal was not found.`, 404);
  }
  if (terminal.status !== "ACTIVE" || terminal.verificationStatus !== "VERIFIED") {
    throw corridorError(
      "INVALID_VARIANT_TERMINAL",
      `${label} terminal must be an active, verified operational stop.`,
      400,
      { stopId: String(terminal._id) }
    );
  }

  const visited = new Set();
  let current = terminal;
  while (current) {
    const currentId = idOf(current);
    if (visited.has(currentId)) {
      throw corridorError(
        "STOP_HIERARCHY_CYCLE",
        `${label} terminal has a circular parent hierarchy.`,
        409
      );
    }
    visited.add(currentId);
    if (sameId(current, endpointId)) return terminal;
    if (!current.parentStopId) break;
    current = await loadStop(current.parentStopId, StopModel, session);
  }

  throw corridorError(
    "VARIANT_TERMINAL_OUTSIDE_CORRIDOR_SCOPE",
    `${label} terminal must be the corridor endpoint or one of its active descendants.`,
    400,
    { endpointId: String(endpointId), terminalStopId: String(terminal._id) }
  );
}

async function assertVariantTerminalScope({
  corridor, direction, originTerminalStopId, destinationTerminalStopId,
  StopModel = Stop, session = null,
}) {
  const { originEndpointId, destinationEndpointId } = resolveDirectionalEndpoints(
    corridor, direction
  );
  const [originTerminal, destinationTerminal] = await Promise.all([
    originTerminalStopId
      ? assertTerminalWithinEndpointScope({
          endpointId: originEndpointId, terminalStopId: originTerminalStopId,
          label: "Origin", StopModel, session,
        })
      : null,
    destinationTerminalStopId
      ? assertTerminalWithinEndpointScope({
          endpointId: destinationEndpointId, terminalStopId: destinationTerminalStopId,
          label: "Destination", StopModel, session,
        })
      : null,
  ]);
  return { originTerminal, destinationTerminal, originEndpointId, destinationEndpointId };
}

module.exports = {
  assertTerminalWithinEndpointScope,
  assertVariantTerminalScope,
  resolveDirectionalEndpoints,
};

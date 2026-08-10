"use strict";
const mongoose = require("mongoose");
const RouteCorridor = require("../../../../models/routeCorridorModel.js");
const { buildCorridorPairKey } = require("../../../domain/corridor/corridor-identity.js");
const { corridorError } = require("../../../domain/corridor/corridor-errors.js");
const { resolveCorridorEndpoint } = require("./corridor/corridor-endpoint.policy.js");
const { assertCorridorCanActivate, hasUsableVariant } = require("./corridor/corridor-activation.policy.js");
const { assertCorridorCanDelete } = require("./corridor/corridor-reference.policy.js");
const { buildCorridorQuery } = require("./corridor/corridor-query.service.js");
const { mapCorridor } = require("./corridor/corridor.mapper.js");
const {
  resolveWritableCorridorSource,
} = require("./corridor/corridor-source.policy.js");

const ENDPOINT_FIELDS = "name code municipality district province status verificationStatus isSearchable isRouteStop coordinates";
function mapWriteError(error, existingCorridorId = null) {
  if (error?.code !== 11000) throw error;
  throw corridorError(
    error.keyPattern?._endpointPairKey
      ? "CORRIDOR_PAIR_CONFLICT" : "CORRIDOR_CODE_CONFLICT",
    "A corridor between these endpoints already exists.", 409,
    existingCorridorId ? { corridorId: String(existingCorridorId) } : undefined
  );
}

async function resolveEndpoints(data) {
  const origin = await resolveCorridorEndpoint({
    stopId: data.originStopId || data.originId,
    stopCode: data.originCode,
  }, "Corridor origin");
  const destination = await resolveCorridorEndpoint({
    stopId: data.destinationStopId || data.destinationId,
    stopCode: data.destinationCode,
  }, "Corridor destination");
  const pairKey = buildCorridorPairKey(origin._id, destination._id);
  return { origin, destination, pairKey };
}

function findExistingPair({ origin, destination, pairKey }) {
  return RouteCorridor.findOne({ $or: [
    { _endpointPairKey: pairKey },
    { originId: origin._id, destinationId: destination._id },
    { originId: destination._id, destinationId: origin._id },
  ] });
}

async function loadCorridor(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw corridorError("INVALID_CORRIDOR_ID", "Corridor ID is invalid.");
  }
  const corridor = await RouteCorridor.findById(id)
    .populate("originId", ENDPOINT_FIELDS)
    .populate("destinationId", ENDPOINT_FIELDS);
  if (!corridor) {
    throw corridorError("CORRIDOR_NOT_FOUND", "Corridor not found.", 404);
  }
  return corridor;
}

async function registerCorridor(data, adminId, returnExisting = false) {
  const endpoints = await resolveEndpoints(data);
  const source = resolveWritableCorridorSource(data.source);
  const existing = await findExistingPair(endpoints);
  if (existing) {
    if (returnExisting) return loadCorridor(existing._id);
    throw corridorError(
      "CORRIDOR_PAIR_CONFLICT",
      `A corridor between ${endpoints.origin.name} and ${endpoints.destination.name} already exists.`,
      409, { corridorId: String(existing._id) }
    );
  }
  try {
    const corridor = await RouteCorridor.create({
      code: `${endpoints.origin.code}-${endpoints.destination.code}`,
      originId: endpoints.origin._id,
      destinationId: endpoints.destination._id,
      _endpointPairKey: endpoints.pairKey,
      status: "PENDING", isSymmetric: true,
      source,
      sourceReferenceId: data.sourceReferenceId || null,
      notes: data.notes, createdBy: adminId || null,
    });
    return loadCorridor(corridor._id);
  } catch (error) {
    if (error?.code === 11000 && returnExisting) {
      const raced = await findExistingPair(endpoints);
      if (raced) return loadCorridor(raced._id);
    }
    if (error?.code === 11000 && error.keyPattern?._endpointPairKey) {
      const raced = await findExistingPair(endpoints);
      return mapWriteError(error, raced?._id);
    }
    return mapWriteError(error);
  }
}

async function createCorridor(data, adminId) {
  return mapCorridor(await registerCorridor(data, adminId));
}

function findOrCreateCorridor(data, adminId) {
  return registerCorridor(data, adminId, true);
}

async function getAllCorridors(filters = {}) {
  const query = await buildCorridorQuery(filters);
  const corridors = await RouteCorridor.find(query)
    .populate("originId", ENDPOINT_FIELDS)
    .populate("destinationId", ENDPOINT_FIELDS)
    .sort({ code: 1 }).lean();
  return corridors.map(mapCorridor);
}

function getCorridorById(id) {
  return loadCorridor(id);
}

async function updateCorridor(id, data, adminId) {
  const corridor = await loadCorridor(id);
  if (data.isSymmetric === false) {
    throw corridorError(
      "CORRIDOR_DIRECTION_NEUTRAL", "A corridor is always direction-neutral."
    );
  }
  if (data.status === "ACTIVE") await assertCorridorCanActivate(id);
  if (data.notes !== undefined) corridor.notes = data.notes;
  if (data.status !== undefined) corridor.status = data.status;
  corridor.updatedBy = adminId || corridor.updatedBy;
  await corridor.save();
  return mapCorridor(await loadCorridor(id));
}

async function activateCorridorIfReady(id, adminId) {
  if (!await hasUsableVariant(id)) return false;
  await RouteCorridor.findByIdAndUpdate(id, {
    status: "ACTIVE", updatedBy: adminId || null,
  });
  return true;
}

async function deleteCorridor(id) {
  const corridor = await loadCorridor(id);
  await assertCorridorCanDelete(corridor);
  await RouteCorridor.findByIdAndDelete(id);
}

module.exports = {
  activateCorridorIfReady, createCorridor, deleteCorridor,
  findOrCreateCorridor, getAllCorridors, getCorridorById, updateCorridor,
};

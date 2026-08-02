"use strict";

const {
  buildCorridorPairKey, endpointId,
} = require("../../../../domain/corridor/corridor-identity.js");

function endpointProblem(stop, label) {
  if (!stop) return `${label} stop does not exist.`;
  if (stop.status !== "ACTIVE" || stop.verificationStatus !== "VERIFIED" ||
      stop.isSearchable !== true) {
    return `${label} stop is not active, verified and searchable.`;
  }
  return null;
}

function buildCorridorMigrationPlan(corridors, stops) {
  const stopMap = new Map(stops.map((stop) => [endpointId(stop), stop]));
  const identities = new Map();
  const invalidRecords = [];
  const plannedUpdates = [];
  for (const corridor of corridors) {
    const corridorId = endpointId(corridor);
    const origin = stopMap.get(endpointId(corridor.originId));
    const destination = stopMap.get(endpointId(corridor.destinationId));
    const problems = [
      endpointProblem(origin, "Origin"),
      endpointProblem(destination, "Destination"),
    ].filter(Boolean);
    let pairKey;
    try {
      pairKey = buildCorridorPairKey(corridor.originId, corridor.destinationId);
    } catch (error) {
      problems.push(error.message);
    }
    if (problems.length) {
      invalidRecords.push({ corridorId, code: corridor.code, problems });
      continue;
    }
    const matches = identities.get(pairKey) || [];
    matches.push({ corridorId, code: corridor.code });
    identities.set(pairKey, matches);
    const changes = {};
    if (corridor._endpointPairKey !== pairKey) changes._endpointPairKey = pairKey;
    if (corridor.isSymmetric !== true) changes.isSymmetric = true;
    if (!corridor.source) changes.source = "ADMIN";
    if (Object.keys(changes).length) {
      plannedUpdates.push({ corridorId, changes });
    }
  }
  const identityConflicts = [...identities.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([pairKey, matches]) => ({ pairKey, matches }));
  return {
    scanned: corridors.length,
    invalidRecords, identityConflicts, plannedUpdates,
    unchanged: corridors.length - invalidRecords.length - plannedUpdates.length,
    safeToApply: invalidRecords.length === 0 && identityConflicts.length === 0,
  };
}

module.exports = { buildCorridorMigrationPlan };

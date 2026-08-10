"use strict";

const {
  buildCorridorPairKey, endpointId,
} = require("../../../../domain/corridor/corridor-identity.js");

function createdTime(corridor) {
  const time = new Date(corridor.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function chooseSurvivor(corridors) {
  return [...corridors].sort((left, right) =>
    createdTime(left) - createdTime(right) ||
    endpointId(left).localeCompare(endpointId(right))
  )[0];
}

function isReversed(corridor, survivor) {
  return endpointId(corridor.originId) === endpointId(survivor.destinationId) &&
    endpointId(corridor.destinationId) === endpointId(survivor.originId);
}

function normalizedDirection(value) {
  const direction = String(value || "FORWARD").toUpperCase();
  return ["FORWARD", "RETURN"].includes(direction) ? direction : null;
}

function flipDirection(direction) {
  return direction === "FORWARD" ? "RETURN" : "FORWARD";
}

function mergedStatus(corridors, variants) {
  if (variants.some((variant) => variant.status === "ACTIVE")) return "ACTIVE";
  if (variants.some((variant) => variant.status === "INACTIVE") ||
      corridors.some((corridor) => corridor.status === "INACTIVE")) {
    return "INACTIVE";
  }
  return "PENDING";
}

function mergedNotes(corridors) {
  const notes = [...new Set(corridors.map((item) => item.notes?.trim())
    .filter(Boolean))];
  return notes.length ? notes.join("\n\n") : null;
}

function maximumVariantSequence(corridors, variants) {
  const counters = corridors.map((item) => Number(item.variantSequence) || 0);
  const codes = variants.map((item) => {
    const match = /-V(\d+)-(?:F|R)$/i.exec(String(item.code || ""));
    return match ? Number(match[1]) : 0;
  });
  return Math.max(0, ...counters, ...codes);
}

function buildDuplicateCorridorPlan(corridors, variants) {
  const groups = new Map();
  const invalidRecords = [];
  for (const corridor of corridors) {
    try {
      const key = buildCorridorPairKey(corridor.originId, corridor.destinationId);
      groups.set(key, [...(groups.get(key) || []), corridor]);
    } catch (error) {
      invalidRecords.push({ corridorId: endpointId(corridor), problem: error.message });
    }
  }
  const variantMap = new Map();
  for (const variant of variants) {
    const corridorId = endpointId(variant.corridorId);
    variantMap.set(corridorId, [...(variantMap.get(corridorId) || []), variant]);
  }
  const merges = [];
  for (const [pairKey, matches] of groups) {
    if (matches.length < 2) continue;
    const survivor = chooseSurvivor(matches);
    const groupVariants = matches.flatMap((item) => variantMap.get(endpointId(item)) || []);
    const variantMoves = [];
    for (const corridor of matches) {
      if (endpointId(corridor) === endpointId(survivor)) continue;
      for (const variant of variantMap.get(endpointId(corridor)) || []) {
        const direction = normalizedDirection(variant.direction);
        if (!direction) {
          invalidRecords.push({
            corridorId: endpointId(corridor), variantId: endpointId(variant),
            problem: `Unsupported variant direction: ${variant.direction}`,
          });
          continue;
        }
        variantMoves.push({
          variantId: endpointId(variant),
          direction: isReversed(corridor, survivor)
            ? flipDirection(direction) : direction,
        });
      }
    }
    merges.push({
      pairKey, survivorId: endpointId(survivor),
      duplicateIds: matches.map(endpointId).filter((id) => id !== endpointId(survivor)),
      variantMoves, status: mergedStatus(matches, groupVariants),
      notes: mergedNotes(matches),
      variantSequence: maximumVariantSequence(matches, groupVariants),
    });
  }
  return {
    scanned: corridors.length, merges, invalidRecords,
    safeToApply: invalidRecords.length === 0,
    duplicateCorridors: merges.reduce((total, item) => total + item.duplicateIds.length, 0),
  };
}

module.exports = { buildDuplicateCorridorPlan };

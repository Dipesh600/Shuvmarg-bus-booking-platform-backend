"use strict";

const Stop = require("../../../../../models/stopModel");
const { validateStopRecord } = require("./stop-record-validation");
const { validateStopHierarchy } = require("./stop-hierarchy-validation");
const { scanStopIdentityConflicts } = require("./stop-identity-conflict-scan");

async function scanStopRegistry() {
  const stops = await Stop.find({}).lean();

  const result = {
    scanned: stops.length,
    valid: 0,
    invalidRecords: [],
    identityConflicts: [],
    hierarchyConflicts: [],
    plannedUpdates: [],
    currentIndexes: [],
  };

  const stopMap = new Map();
  for (const stop of stops) {
    stopMap.set(stop._id.toString(), stop);
  }

  const identityMap = new Map();

  for (const stop of stops) {
    let isValid = true;

    const recordErrors = validateStopRecord(stop);
    if (recordErrors.length > 0) {
      result.invalidRecords.push(...recordErrors);
      isValid = false;
    }

    const hierarchyErrors = validateStopHierarchy(stop, stopMap);
    if (hierarchyErrors.length > 0) {
      result.invalidRecords.push(...hierarchyErrors);
      isValid = false;
    }

    const { identity, error: identityErr } = scanStopIdentityConflicts(stop, identityMap);
    if (identityErr) {
      result.invalidRecords.push(identityErr);
      isValid = false;
    }

    if (isValid) {
      result.valid++;
      const updates = {};
      let modified = false;

      if (stop._normalizedIdentity !== identity) {
        updates._normalizedIdentity = identity;
        modified = true;
      }
      if (stop.isSearchable === undefined) {
        updates.isSearchable = true;
        modified = true;
      }
      if (stop.isRouteStop === undefined) {
        updates.isRouteStop = true;
        modified = true;
      }
      if (stop.parentStopId === undefined) {
        updates.parentStopId = null;
        modified = true;
      }
      if (Array.isArray(stop.aliases)) {
        const normalized = stop.aliases
          .map((a) => a.toLowerCase().trim())
          .filter((a) => a);
        if (
          stop.aliases.length !== normalized.length ||
          stop.aliases.some((a, i) => a !== normalized[i])
        ) {
          updates.aliases = normalized;
          modified = true;
        }
      }

      if (modified) {
        result.plannedUpdates.push({ id: stop._id, updates });
      }
    }
  }

  result.currentIndexes = await Stop.collection.indexes();
  return result;
}

module.exports = { scanStopRegistry };

"use strict";

const Stop = require("../../../../../models/stopModel");
const { buildStopIdentity } = require("../stop-identity");
const { scanError } = require("./migration-errors");

/**
 * Phase 1 — Scan the stop collection.
 *
 * Loads all stops and validates:
 *   - name presence
 *   - coordinate consistency
 *   - parent existence and active status
 *   - hierarchy cycles
 *   - normalized identity buildability
 *   - identity uniqueness across the collection
 *
 * Also reads the current collection index list for later planning.
 *
 * Returns a scan result object consumed by migration-plan.service.js.
 */
async function scanStopRegistry() {
  const stops = await Stop.find({}).lean();

  const result = {
    scanned: stops.length,
    valid: 0,
    invalidRecords: [],
    identityConflicts: [],
    plannedUpdates: [],
    currentIndexes: []
  };

  const stopMap = new Map();
  for (const stop of stops) {
    stopMap.set(stop._id.toString(), stop);
  }

  const identityMap = new Map();

  for (const stop of stops) {
    let isValid = true;

    if (!stop.name || stop.name.trim() === "") {
      result.invalidRecords.push(
        scanError(stop, "INVALID_STOP_NAME", "Stop name is required and cannot be blank.")
      );
      isValid = false;
    }

    if (stop.coordinates) {
      const { lat, lng } = stop.coordinates;
      if ((lat === null && lng !== null) || (lat !== null && lng === null)) {
        result.invalidRecords.push(
          scanError(stop, "INVALID_STOP_COORDINATES",
            "Both latitude and longitude must be provided, or both must be null.")
        );
        isValid = false;
      } else if (lat !== null) {
        if (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
          result.invalidRecords.push(
            scanError(stop, "INVALID_STOP_COORDINATES", "Latitude must be between -90 and 90.")
          );
          isValid = false;
        }
        if (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180 || lng > 180) {
          result.invalidRecords.push(
            scanError(stop, "INVALID_STOP_COORDINATES", "Longitude must be between -180 and 180.")
          );
          isValid = false;
        }
      }
    }

    if (stop.parentStopId) {
      const parentIdStr = stop.parentStopId.toString();
      const parent = stopMap.get(parentIdStr);

      if (!parent) {
        result.invalidRecords.push(
          scanError(stop, "INVALID_PARENT_STOP",
            `Parent stop ${parentIdStr} does not exist.`)
        );
        isValid = false;
      } else if (parent.status !== "ACTIVE") {
        result.invalidRecords.push(
          scanError(stop, "INACTIVE_PARENT_STOP",
            `Parent stop ${parentIdStr} is inactive.`)
        );
        isValid = false;
      } else {
        let currentParent = parent;
        const visited = new Set([stop._id.toString()]);

        while (currentParent) {
          if (visited.has(currentParent._id.toString())) {
            result.invalidRecords.push(
              scanError(stop, "STOP_HIERARCHY_CYCLE", "Hierarchy cycle detected.")
            );
            isValid = false;
            break;
          }
          visited.add(currentParent._id.toString());
          currentParent = currentParent.parentStopId
            ? stopMap.get(currentParent.parentStopId.toString())
            : null;
        }
      }
    }

    let identity = null;
    try {
      identity = buildStopIdentity({
        name: stop.name,
        district: stop.district,
        municipality: stop.municipality,
        parentStopId: stop.parentStopId
      });
    } catch (err) {
      if (isValid) {
        result.invalidRecords.push(
          scanError(stop, "INVALID_STOP_NAME", err.message)
        );
        isValid = false;
      }
    }

    if (identity) {
      if (identityMap.has(identity)) {
        result.invalidRecords.push(
          scanError(stop, "STOP_IDENTITY_CONFLICT",
            `Stops share the same identity: "${identity}"`)
        );
        isValid = false;
      } else {
        identityMap.set(identity, stop._id);
      }
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
          .map(a => a.toLowerCase().trim())
          .filter(a => a);
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

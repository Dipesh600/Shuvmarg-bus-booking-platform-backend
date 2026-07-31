"use strict";

const Stop = require("../../../../models/stopModel");
const { buildStopIdentity } = require("./stop-identity");

async function scanStopRegistry() {
  const stops = await Stop.find({}).lean();
  
  const result = {
    scanned: stops.length,
    valid: 0,
    invalidRecords: [],
    identityConflicts: [],
    hierarchyConflicts: [],
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
    
    // Validate name
    if (!stop.name || stop.name.trim() === "") {
      result.invalidRecords.push({
        stopId: stop._id,
        code: stop.code,
        name: stop.name,
        errorCode: "INVALID_STOP_NAME",
        message: "Stop name is required and cannot be blank."
      });
      isValid = false;
    }

    // Validate coordinates
    if (stop.coordinates) {
      const { lat, lng } = stop.coordinates;
      if ((lat === null && lng !== null) || (lat !== null && lng === null)) {
        result.invalidRecords.push({
          stopId: stop._id, code: stop.code, name: stop.name,
          errorCode: "INVALID_STOP_COORDINATES",
          message: "Both latitude and longitude must be provided, or both must be null."
        });
        isValid = false;
      } else if (lat !== null) {
        if (Number.isNaN(lat) || !Number.isFinite(lat) || lat < -90 || lat > 90) {
          result.invalidRecords.push({
            stopId: stop._id, code: stop.code, name: stop.name,
            errorCode: "INVALID_STOP_COORDINATES",
            message: "Latitude must be between -90 and 90."
          });
          isValid = false;
        }
        if (Number.isNaN(lng) || !Number.isFinite(lng) || lng < -180 || lng > 180) {
          result.invalidRecords.push({
            stopId: stop._id, code: stop.code, name: stop.name,
            errorCode: "INVALID_STOP_COORDINATES",
            message: "Longitude must be between -180 and 180."
          });
          isValid = false;
        }
      }
    }

    // Validate parent hierarchy
    if (stop.parentStopId) {
      const parentIdStr = stop.parentStopId.toString();
      const parent = stopMap.get(parentIdStr);
      
      if (!parent) {
        result.invalidRecords.push({
          stopId: stop._id, code: stop.code, name: stop.name,
          errorCode: "INVALID_PARENT_STOP",
          message: `Parent stop ${parentIdStr} does not exist.`
        });
        isValid = false;
      } else if (parent.status !== "ACTIVE") {
        result.invalidRecords.push({
          stopId: stop._id, code: stop.code, name: stop.name,
          errorCode: "INACTIVE_PARENT_STOP",
          message: `Parent stop ${parentIdStr} is inactive.`
        });
        isValid = false;
      } else {
        // Cycle detection
        let currentParent = parent;
        const visited = new Set([stop._id.toString()]);
        
        while (currentParent) {
          if (visited.has(currentParent._id.toString())) {
            result.invalidRecords.push({
              stopId: stop._id, code: stop.code, name: stop.name,
              errorCode: "STOP_HIERARCHY_CYCLE",
              message: "Hierarchy cycle detected."
            });
            isValid = false;
            break;
          }
          visited.add(currentParent._id.toString());
          currentParent = currentParent.parentStopId ? stopMap.get(currentParent.parentStopId.toString()) : null;
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
        result.invalidRecords.push({
          stopId: stop._id, code: stop.code, name: stop.name,
          errorCode: "INVALID_STOP_NAME",
          message: err.message
        });
        isValid = false;
      }
    }

    if (identity) {
      if (identityMap.has(identity)) {
        result.invalidRecords.push({
          stopId: stop._id, code: stop.code, name: stop.name,
          errorCode: "STOP_IDENTITY_CONFLICT",
          message: `Stops share the same identity: "${identity}"`
        });
        isValid = false;
      } else {
        identityMap.set(identity, stop._id);
      }
    }

    if (isValid) {
      result.valid++;
      
      // Calculate updates
      let modified = false;
      const updates = {};
      
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
      // handle aliases casing? buildStopIdentity normalizes names, maybe alias normalization too?
      // "normalized aliases" was mentioned in plan. Let's do it if there's any.
      if (Array.isArray(stop.aliases)) {
        const normalizedAliases = stop.aliases.map(a => a.toLowerCase().trim()).filter(a => a);
        // check if different
        if (stop.aliases.length !== normalizedAliases.length || stop.aliases.some((a, i) => a !== normalizedAliases[i])) {
          updates.aliases = normalizedAliases;
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

async function applyStopBackfill(plannedUpdates) {
  if (plannedUpdates.length === 0) {
    return { matched: 0, modified: 0, unchanged: 0 };
  }
  
  const bulkOps = plannedUpdates.map(doc => ({
    updateOne: {
      filter: { _id: doc.id },
      update: { $set: doc.updates }
    }
  }));
  
  const result = await Stop.collection.bulkWrite(bulkOps);
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    unchanged: result.matchedCount - result.modifiedCount
  };
}

async function transitionStopIndexes(currentIndexes) {
  const result = {
    indexesFound: currentIndexes.length,
    indexesRemoved: 0,
    indexesCreated: 0,
    indexesAlreadyCorrect: 0
  };

  const hasNameLower = currentIndexes.some(i => i.name === "_nameLower_1");
  const hasIdentity = currentIndexes.some(i => i.name === "_normalizedIdentity_1" && i.unique === true);
  const hasParentIdx = currentIndexes.some(i => i.name === "parentStopId_1_status_1" || (i.key.parentStopId === 1 && i.key.status === 1));

  if (hasNameLower) {
    await Stop.collection.dropIndex("_nameLower_1");
    result.indexesRemoved++;
  }

  if (!hasIdentity) {
    // Note: if the index existed but unique was false, we would need to drop it first, 
    // but mongoose standard indexes don't have this. We will just create it.
    await Stop.collection.createIndex({ _normalizedIdentity: 1 }, { unique: true });
    result.indexesCreated++;
  } else {
    result.indexesAlreadyCorrect++;
  }

  if (!hasParentIdx) {
    await Stop.collection.createIndex({ parentStopId: 1, status: 1 });
    result.indexesCreated++;
  } else {
    result.indexesAlreadyCorrect++;
  }
  
  return result;
}

async function verifyStopRegistryMigration() {
  const stops = await Stop.find({}).lean();
  
  const invalid = [];
  const identityMap = new Set();
  
  for (const stop of stops) {
    if (stop.isSearchable === undefined || stop.isRouteStop === undefined) {
      invalid.push(`Stop ${stop._id} missing capabilities`);
    }
    if (stop.parentStopId === undefined) {
      invalid.push(`Stop ${stop._id} missing parentStopId field (should be null or id)`);
    }
    if (!stop._normalizedIdentity) {
      invalid.push(`Stop ${stop._id} missing _normalizedIdentity`);
    }
    
    let expectedIdentity = "";
    try {
      expectedIdentity = buildStopIdentity(stop);
    } catch(e) {}
    
    if (stop._normalizedIdentity !== expectedIdentity) {
      invalid.push(`Stop ${stop._id} has mismatching identity: ${stop._normalizedIdentity} != ${expectedIdentity}`);
    }
    
    if (identityMap.has(stop._normalizedIdentity)) {
      invalid.push(`Duplicate identity found: ${stop._normalizedIdentity}`);
    }
    identityMap.add(stop._normalizedIdentity);
  }
  
  const indexes = await Stop.collection.indexes();
  const hasNameLower = indexes.some(i => i.name === "_nameLower_1");
  const hasIdentity = indexes.some(i => i.name === "_normalizedIdentity_1" && i.unique === true);
  
  if (hasNameLower) {
    invalid.push(`_nameLower_1 index still exists`);
  }
  if (!hasIdentity) {
    invalid.push(`_normalizedIdentity_1 unique index missing`);
  }
  
  return {
    passed: invalid.length === 0,
    errors: invalid
  };
}

async function runStopRegistryMigration(options = { dryRun: false }) {
  const { dryRun } = options;
  
  const scanResult = await scanStopRegistry();
  
  const hasConflicts = scanResult.invalidRecords.length > 0;
  
  const report = {
    dryRun,
    scanned: scanResult.scanned,
    invalid: scanResult.invalidRecords.length,
    invalidRecords: scanResult.invalidRecords,
    wouldUpdate: scanResult.plannedUpdates.length,
    unchanged: scanResult.scanned - scanResult.plannedUpdates.length,
    conflicts: hasConflicts ? scanResult.invalidRecords.length : 0,
    indexesToRemove: scanResult.currentIndexes.some(i => i.name === "_nameLower_1") ? 1 : 0,
    indexesToCreate: 0,
    indexesAlreadyCorrect: 0,
    backfillResult: null,
    indexResult: null,
    verification: null
  };
  
  let neededCreate = 0;
  let alreadyCorrect = 0;
  
  const hasIdentity = scanResult.currentIndexes.some(i => i.name === "_normalizedIdentity_1" && i.unique === true);
  const hasParentIdx = scanResult.currentIndexes.some(i => i.name === "parentStopId_1_status_1" || (i.key.parentStopId === 1 && i.key.status === 1));
  
  if (!hasIdentity) neededCreate++; else alreadyCorrect++;
  if (!hasParentIdx) neededCreate++; else alreadyCorrect++;
  
  report.indexesToCreate = neededCreate;
  report.indexesAlreadyCorrect = alreadyCorrect;

  if (hasConflicts) {
    return { success: false, abortReason: "Validation failed during scan.", report };
  }

  if (dryRun) {
    return { success: true, report };
  }
  
  // Apply Backfill
  report.backfillResult = await applyStopBackfill(scanResult.plannedUpdates);
  
  // Transition Indexes
  report.indexResult = await transitionStopIndexes(scanResult.currentIndexes);
  
  // Verify
  const verification = await verifyStopRegistryMigration();
  report.verification = verification;
  
  if (!verification.passed) {
    return { success: false, abortReason: "Verification failed after updates.", report };
  }

  return { success: true, report };
}

module.exports = {
  scanStopRegistry,
  applyStopBackfill,
  transitionStopIndexes,
  verifyStopRegistryMigration,
  runStopRegistryMigration
};

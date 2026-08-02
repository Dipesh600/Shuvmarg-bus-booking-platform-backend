"use strict";

function buildMigrationPreflight({ scanResult, recordPlan, indexInspection, indexPlan }) {
  const invalidRecords = (scanResult && scanResult.invalidRecords) || [];

  const identityConflicts = invalidRecords.filter(
    (r) => r.errorCode === "STOP_IDENTITY_CONFLICT"
  );
  const hierarchyConflicts = invalidRecords.filter(
    (r) =>
      r.errorCode === "STOP_HIERARCHY_CYCLE" ||
      r.errorCode === "INACTIVE_PARENT_STOP" ||
      r.errorCode === "INVALID_PARENT_STOP"
  );

  const reasons = [];

  if (invalidRecords.length > 0) {
    reasons.push({
      code: "INVALID_STOP_DATA",
      message: `${invalidRecords.length} stop record(s) failed validation.`,
    });
  }

  if (indexPlan && !indexPlan.ok) {
    for (const invIdx of indexPlan.invalidIndexes || []) {
      reasons.push({
        code: invIdx.errorCode || "INVALID_INDEX_CONFIGURATION",
        indexName: invIdx.indexName,
        message: invIdx.message,
      });
    }
  }

  const recordPlanOk = recordPlan && typeof recordPlan.ok === "boolean" ? recordPlan.ok : true;
  const indexPlanOk = indexPlan && typeof indexPlan.ok === "boolean" ? indexPlan.ok : true;
  const safeToApply = reasons.length === 0 && recordPlanOk && indexPlanOk;

  const plannedUpdates = (scanResult && scanResult.plannedUpdates) || [];
  const scannedCount = (scanResult && scanResult.scanned) || 0;
  const validCount = (scanResult && scanResult.valid) || 0;

  return {
    safeToApply,
    records: {
      scanned: scannedCount,
      valid: validCount,
      invalidRecords,
      identityConflicts,
      hierarchyConflicts,
      plannedUpdates,
      wouldUpdate: plannedUpdates.length,
      unchanged: validCount - plannedUpdates.length,
    },
    indexes: indexPlan
      ? {
          found: (indexInspection && indexInspection.found) || [],
          indexesToRemove: indexPlan.indexesToRemove || [],
          indexesToCreate: indexPlan.indexesToCreate || [],
          indexesAlreadyCorrect: indexPlan.indexesAlreadyCorrect || [],
          invalidIndexes: indexPlan.invalidIndexes || [],
          preservedIndexes: indexPlan.preservedIndexes || [],
        }
      : {
          found: [],
          indexesToRemove: [],
          indexesToCreate: [],
          indexesAlreadyCorrect: [],
          invalidIndexes: [],
          preservedIndexes: [],
        },
    reasons,
  };
}

module.exports = { buildMigrationPreflight };

"use strict";

const Stop = require("../../../../models/stopModel");
const { scanStopRegistry } = require("./stop-registry-migration/migration-scan.service");
const { buildMigrationPlan } = require("./stop-registry-migration/migration-plan.service");
const { applyStopBackfill } = require("./stop-registry-migration/migration-backfill.service");
const {
  inspectStopIndexes, buildIndexPlan, applyIndexPlan,
} = require("./stop-registry-migration/migration-index.service");
const { verifyStopRegistryMigration } = require("./stop-registry-migration/migration-verification.service");
const { buildMigrationPreflight } = require("./stop-registry-migration/migration-preflight");

async function runStopRegistryMigration(options = {}) {
  const dryRun = options.dryRun === true;

  let scanResult;
  try {
    scanResult = await scanStopRegistry();
  } catch (err) {
    return {
      success: false, dryRun, safeToApply: false,
      error: `Scan failed: ${err.message}`,
      report: { scanError: err.message, invalid: 0, invalidRecords: [] },
    };
  }

  const recordPlan = buildMigrationPlan(scanResult);

  let indexInspection = null;
  let indexPlan = null;
  try {
    indexInspection = await inspectStopIndexes(Stop.collection);
    indexPlan = buildIndexPlan(indexInspection);
  } catch (err) {
    indexPlan = {
      ok: false,
      invalidIndexes: [{
        errorCode: "INDEX_INSPECTION_FAILED", indexName: "all",
        message: `Failed to inspect collection indexes: ${err.message}`,
      }],
    };
    indexInspection = { found: [], preservedIndexes: [] };
  }

  const preflight = buildMigrationPreflight({ scanResult, recordPlan, indexInspection, indexPlan });

  const report = {
    scanned: preflight.records.scanned, valid: preflight.records.valid,
    invalid: preflight.records.invalidRecords.length,
    invalidRecords: preflight.records.invalidRecords,
    identityConflicts: preflight.records.identityConflicts,
    hierarchyConflicts: preflight.records.hierarchyConflicts,
    wouldUpdate: preflight.records.wouldUpdate,
    records: preflight.records, indexes: preflight.indexes, reasons: preflight.reasons,
    safeToApply: preflight.safeToApply,
    indexesToRemove: preflight.indexes.indexesToRemove,
    indexesToCreate: preflight.indexes.indexesToCreate,
  };

  if (!preflight.safeToApply) {
    return {
      success: false, dryRun, safeToApply: false,
      error: "Stop Registry preflight checks failed.", report,
    };
  }

  if (dryRun) {
    return {
      success: true, dryRun: true, safeToApply: true,
      records: preflight.records, indexes: preflight.indexes,
      backfillResult: null, indexResult: null, verification: null, report,
    };
  }

  let backfillResult;
  try {
    backfillResult = await applyStopBackfill(recordPlan.plannedUpdates);
  } catch (err) {
    return {
      success: false, dryRun: false, safeToApply: true,
      error: `Stop backfill failed: ${err.message}`,
      backfillResult: null, indexResult: null, verification: null,
      report: { ...report, backfillError: err.message },
    };
  }

  let indexResult;
  try {
    indexResult = await applyIndexPlan(Stop.collection, indexPlan);
  } catch (err) {
    return {
      success: false, dryRun: false, error: `Index transition failed: ${err.message}`,
      backfillResult, indexResult: null, verification: null, report,
    };
  }

  const verification = await verifyStopRegistryMigration({
    preservedIndexNames: indexResult.preserved,
    expectedRecordCount: scanResult.scanned,
  });

  return {
    success: verification.passed, dryRun: false, backfillResult, indexResult, verification, report,
  };
}

module.exports = { runStopRegistryMigration, buildMigrationPreflight };

"use strict";

const { scanStopRegistry } = require("./stop-registry-migration/migration-scan.service");
const { buildMigrationPlan } = require("./stop-registry-migration/migration-plan.service");
const { applyStopBackfill } = require("./stop-registry-migration/migration-backfill.service");
const {
  inspectStopIndexes,
  buildIndexPlan,
  applyIndexPlan
} = require("./stop-registry-migration/migration-index.service");
const { verifyStopRegistryMigration } = require("./stop-registry-migration/migration-verification.service");

const Stop = require("../../../../models/stopModel");

/**
 * Run the Stop Registry migration.
 *
 * Phases:
 *   1. Scan    — validate all stop records, detect identity conflicts.
 *   2. Plan    — compute record updates and index transition plan.
 *   3. [dryRun exit] — return plan without making changes.
 *   4. Backfill — apply _normalizedIdentity and capability fields.
 *   5. Index   — inspect → plan → abort-if-invalid → apply.
 *   6. Verify  — re-read data + indexes, confirm expected state.
 *
 * @param {{ dryRun?: boolean }} options
 */
async function runStopRegistryMigration(options = {}) {
  const dryRun = options.dryRun === true;

  // ── Phase 1: Scan ──────────────────────────────────────────────────────────
  const scanResult = await scanStopRegistry();

  if (scanResult.invalidRecords.length > 0) {
    const plan = buildMigrationPlan(scanResult);
    return {
      success: false,
      abortReason: "Validation failed during scan.",
      report: {
        dryRun,
        scanned: plan.scanned,
        invalid: scanResult.invalidRecords.length,
        invalidRecords: scanResult.invalidRecords,
        wouldUpdate: plan.wouldUpdate,
        unchanged: plan.unchanged,
        indexesToRemove: plan.indexesToRemove,
        indexesToCreate: plan.indexesToCreate,
        indexesAlreadyCorrect: plan.indexesAlreadyCorrect,
        backfillResult: null,
        indexResult: null,
        verification: null
      }
    };
  }

  // ── Phase 2: Plan ──────────────────────────────────────────────────────────
  const plan = buildMigrationPlan(scanResult);

  // ── Phase 3: Dry-run exit ──────────────────────────────────────────────────
  if (dryRun) {
    return {
      success: true,
      report: {
        dryRun,
        scanned: plan.scanned,
        invalid: 0,
        invalidRecords: [],
        wouldUpdate: plan.wouldUpdate,
        unchanged: plan.unchanged,
        indexesToRemove: plan.indexesToRemove,
        indexesToCreate: plan.indexesToCreate,
        indexesAlreadyCorrect: plan.indexesAlreadyCorrect,
        backfillResult: null,
        indexResult: null,
        verification: null
      }
    };
  }

  // ── Phase 4: Backfill ──────────────────────────────────────────────────────
  const backfillResult = await applyStopBackfill(scanResult.plannedUpdates);

  // ── Phase 5: Index transition ──────────────────────────────────────────────
  const inspection = await inspectStopIndexes(Stop.collection);
  const indexPlan = buildIndexPlan(inspection);

  if (!indexPlan.ok) {
    return {
      success: false,
      abortReason: "Index configuration invalid — aborting before destructive changes.",
      report: {
        dryRun,
        scanned: plan.scanned,
        invalid: 0,
        invalidRecords: [],
        wouldUpdate: plan.wouldUpdate,
        unchanged: plan.unchanged,
        indexesToRemove: plan.indexesToRemove,
        indexesToCreate: plan.indexesToCreate,
        indexesAlreadyCorrect: plan.indexesAlreadyCorrect,
        backfillResult,
        indexResult: { invalidIndexes: indexPlan.invalidIndexes },
        verification: null
      }
    };
  }

  const indexResult = await applyIndexPlan(Stop.collection, indexPlan);

  // ── Phase 6: Verify ────────────────────────────────────────────────────────
  const preservedNames = indexResult.preserved;
  const verification = await verifyStopRegistryMigration(preservedNames);

  const success = verification.passed;
  return {
    success,
    abortReason: success ? undefined : "Verification failed after updates.",
    report: {
      dryRun,
      scanned: plan.scanned,
      invalid: 0,
      invalidRecords: [],
      wouldUpdate: plan.wouldUpdate,
      unchanged: plan.unchanged,
      indexesToRemove: plan.indexesToRemove,
      indexesToCreate: plan.indexesToCreate,
      indexesAlreadyCorrect: plan.indexesAlreadyCorrect,
      backfillResult,
      indexResult,
      verification
    }
  };
}

module.exports = { runStopRegistryMigration };

"use strict";

/**
 * Migration Phase 2 — Build the migration plan.
 *
 * Takes a scan result and produces a human-readable and machine-actionable plan:
 *   - record-level: which stops need backfill, which are already correct
 *   - index-level: summarize what the index transition phase will do
 *
 * Does NOT touch the database.
 */
function buildMigrationPlan(scanResult) {
  const { currentIndexes, plannedUpdates, scanned } = scanResult;

  const unchanged = scanned - plannedUpdates.length;

  const indexSummary = _summarizeIndexPlan(currentIndexes);

  return {
    scanned,
    wouldUpdate: plannedUpdates.length,
    unchanged,
    indexesToRemove: indexSummary.toRemove,
    indexesToCreate: indexSummary.toCreate,
    indexesAlreadyCorrect: indexSummary.alreadyCorrect
  };
}

/**
 * Summarize what the index transition phase would do based on the current
 * index snapshot. This is a lightweight preview only; actual correctness
 * decisions (key comparison, abort-on-invalid) happen in migration-index.service.js.
 */
function _summarizeIndexPlan(currentIndexes) {
  const hasLegacy = currentIndexes.some(i => i.name === "_nameLower_1");
  const hasIdentity = currentIndexes.some(
    i => i.name === "_normalizedIdentity_1" && i.unique === true
  );
  const hasParent = currentIndexes.some(
    i => i.name === "parentStopId_1_status_1" ||
      (i.key && i.key.parentStopId === 1 && i.key.status === 1)
  );

  let toRemove = 0;
  let toCreate = 0;
  let alreadyCorrect = 0;

  if (hasLegacy) toRemove++;
  if (!hasIdentity) toCreate++; else alreadyCorrect++;
  if (!hasParent) toCreate++; else alreadyCorrect++;

  return { toRemove, toCreate, alreadyCorrect };
}

module.exports = { buildMigrationPlan };

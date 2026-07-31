"use strict";

function buildMigrationPlan(scanResult) {
  const { currentIndexes, plannedUpdates = [], scanned = 0 } = scanResult || {};

  const unchanged = scanned - plannedUpdates.length;

  const indexSummary = _summarizeIndexPlan(currentIndexes || []);

  return {
    ok: true,
    scanned,
    plannedUpdates,
    wouldUpdate: plannedUpdates.length,
    unchanged,
    indexesToRemove: indexSummary.toRemove,
    indexesToCreate: indexSummary.toCreate,
    indexesAlreadyCorrect: indexSummary.alreadyCorrect,
  };
}

function _summarizeIndexPlan(currentIndexes) {
  const hasLegacy = currentIndexes.some((i) => i.name === "_nameLower_1");
  const hasIdentity = currentIndexes.some(
    (i) => i.name === "_normalizedIdentity_1" && i.unique === true
  );
  const hasParent = currentIndexes.some(
    (i) =>
      i.name === "parentStopId_1_status_1" ||
      (i.key && i.key.parentStopId === 1 && i.key.status === 1)
  );

  let toRemove = 0;
  let toCreate = 0;
  let alreadyCorrect = 0;

  if (hasLegacy) toRemove++;
  if (!hasIdentity) toCreate++;
  else alreadyCorrect++;
  if (!hasParent) toCreate++;
  else alreadyCorrect++;

  return { toRemove, toCreate, alreadyCorrect };
}

module.exports = { buildMigrationPlan };

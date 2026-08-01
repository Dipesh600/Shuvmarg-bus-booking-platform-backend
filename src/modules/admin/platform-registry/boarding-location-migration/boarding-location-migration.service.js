"use strict";

const {
  scanBoardingLocationMigration,
} = require("./migration-scan.service.js");
const {
  applyBoardingLocationPlan,
  verifyBoardingLocationMigration,
} = require("./migration-apply.service.js");
const {
  applyBoardingLocationIndexes,
} = require("./migration-index.service.js");

function summarize(scan, dryRun) {
  const { plan } = scan;
  return {
    dryRun,
    scanned: scan.scanned,
    safeToApply: plan.safeToApply,
    locationsToCreate: plan.locationsToCreate.length,
    assignmentsToCreate: plan.assignmentsToCreate.length,
    unchanged: plan.unchanged.length,
    syntheticFallbacksSkipped: plan.syntheticFallbacks.length,
    invalidRecords: plan.invalidRecords,
    identityConflicts: plan.identityConflicts,
    indexesToCreate: scan.indexPlan.missing.map((index) => ({
      modelName: index.modelName, name: index.name,
    })),
    invalidIndexes: scan.indexPlan.invalid,
  };
}

async function runBoardingLocationMigration({ dryRun = false } = {}) {
  const scan = await scanBoardingLocationMigration();
  const report = summarize(scan, dryRun);
  if (!scan.plan.safeToApply) {
    return { success: false, abortReason: "Migration preflight failed.", report };
  }
  if (dryRun) return { success: true, report };
  const applied = await applyBoardingLocationPlan(scan.plan);
  applied.indexes = await applyBoardingLocationIndexes(scan.indexPlan);
  const verification = await verifyBoardingLocationMigration(scan);
  return {
    success: verification.passed,
    abortReason: verification.passed ? null : "Migration verification failed.",
    report: { ...report, applied, verification },
  };
}

module.exports = { runBoardingLocationMigration };

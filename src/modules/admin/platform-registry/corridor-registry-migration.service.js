"use strict";

const RouteCorridor = require("../../../../models/routeCorridorModel.js");
const Stop = require("../../../../models/stopModel.js");
const {
  buildCorridorMigrationPlan,
} = require("./corridor-migration/corridor-migration-plan.js");

const PAIR_INDEX_KEY = { _endpointPairKey: 1 };
const PAIR_INDEX = {
  name: "_endpointPairKey_1", unique: true,
  partialFilterExpression: { _endpointPairKey: { $type: "string" } },
};

async function readMigrationPlan() {
  const corridors = await RouteCorridor.find({})
    .select("+_endpointPairKey").lean();
  const endpointIds = [...new Set(corridors.flatMap((corridor) => [
    String(corridor.originId), String(corridor.destinationId),
  ]))];
  const stops = await Stop.find({ _id: { $in: endpointIds } }).lean();
  return buildCorridorMigrationPlan(corridors, stops);
}

async function inspectIndexes() {
  const indexes = await RouteCorridor.collection.indexes();
  const oldUnique = indexes.find((index) => index.unique === true &&
    index.key?.originId === 1 && index.key?.destinationId === 1);
  const pair = indexes.find((index) => index.name === PAIR_INDEX.name);
  const pairValid = !pair || (pair.unique === true &&
    pair.key?._endpointPairKey === 1 &&
    pair.partialFilterExpression?._endpointPairKey?.$type === "string");
  return { indexes, oldUnique, pair, pairValid };
}

function buildBackfillWrites(plannedUpdates) {
  return plannedUpdates.map((update) => ({
    updateOne: {
      filter: { _id: update.corridorId }, update: { $set: update.changes },
    },
  }));
}

async function applyBackfill(plannedUpdates) {
  if (!plannedUpdates.length) return { matched: 0, modified: 0 };
  const result = await RouteCorridor.bulkWrite(
    buildBackfillWrites(plannedUpdates), { ordered: true }
  );
  return {
    matched: result.matchedCount || 0, modified: result.modifiedCount || 0,
  };
}

async function transitionIndexes(inspection) {
  const removed = [];
  const created = [];
  if (inspection.oldUnique) {
    await RouteCorridor.collection.dropIndex(inspection.oldUnique.name);
    removed.push(inspection.oldUnique.name);
  }
  if (!inspection.pair) {
    await RouteCorridor.collection.createIndex(PAIR_INDEX_KEY, PAIR_INDEX);
    created.push(PAIR_INDEX.name);
  }
  const endpointIndex = (await RouteCorridor.collection.indexes()).find(
    (index) => index.key?.originId === 1 && index.key?.destinationId === 1
  );
  if (!endpointIndex) {
    await RouteCorridor.collection.createIndex(
      { originId: 1, destinationId: 1 },
      { name: "originId_1_destinationId_1" }
    );
    created.push("originId_1_destinationId_1");
  }
  return { removed, created };
}

async function verifyMigration(expectedCount) {
  const plan = await readMigrationPlan();
  const inspection = await inspectIndexes();
  return {
    passed: plan.scanned === expectedCount && plan.safeToApply &&
      plan.plannedUpdates.length === 0 && inspection.pairValid &&
      Boolean(inspection.pair) &&
      !inspection.oldUnique,
    plan,
    pairIndexPresent: Boolean(inspection.pair),
    oldUniqueIndexPresent: Boolean(inspection.oldUnique),
  };
}

async function runCorridorRegistryMigration({ dryRun = false } = {}) {
  const plan = await readMigrationPlan();
  const inspection = await inspectIndexes();
  const report = {
    dryRun, scanned: plan.scanned, wouldUpdate: plan.plannedUpdates.length,
    unchanged: plan.unchanged, invalidRecords: plan.invalidRecords,
    identityConflicts: plan.identityConflicts,
    indexesToRemove: inspection.oldUnique ? [inspection.oldUnique.name] : [],
    indexesToCreate: inspection.pair ? [] : [PAIR_INDEX.name],
    invalidPairIndex: inspection.pairValid ? null : inspection.pair?.name,
  };
  if (!plan.safeToApply || !inspection.pairValid) {
    return { success: false, abortReason: "Corridor preflight failed.", report };
  }
  if (dryRun) return { success: true, report };
  report.backfill = await applyBackfill(plan.plannedUpdates);
  report.indexes = await transitionIndexes(inspection);
  report.verification = await verifyMigration(plan.scanned);
  return {
    success: report.verification.passed,
    abortReason: report.verification.passed ? null : "Verification failed.",
    report,
  };
}

module.exports = {
  buildBackfillWrites, inspectIndexes, runCorridorRegistryMigration,
  verifyMigration,
};

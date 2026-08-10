"use strict";

const mongoose = require("mongoose");
const Bus = require("../../../../../models/fleetModel.js");
const RouteCorridor = require("../../../../../models/routeCorridorModel.js");
const RouteVariant = require("../../../../../models/routeVariantModel.js");
const {
  buildDuplicateCorridorPlan,
} = require("./corridor-duplicate-plan.js");
const {
  runCorridorRegistryMigration,
} = require("../corridor-registry-migration.service.js");

async function readPlan() {
  const corridors = await RouteCorridor.find({})
    .select("+_endpointPairKey +variantSequence").lean();
  const variants = await RouteVariant.find({
    corridorId: { $in: corridors.map((item) => item._id) },
  }).lean();
  return buildDuplicateCorridorPlan(corridors, variants);
}

async function applyMerge(merge, session) {
  for (const move of merge.variantMoves) {
    await RouteVariant.updateOne(
      { _id: move.variantId },
      { $set: { corridorId: merge.survivorId, direction: move.direction } },
      { session }
    );
  }
  await Bus.updateMany(
    { corridorId: { $in: merge.duplicateIds } },
    { $set: { corridorId: merge.survivorId } },
    { session }
  );
  await RouteCorridor.updateOne(
    { _id: merge.survivorId },
    { $set: {
      _endpointPairKey: merge.pairKey,
      isSymmetric: true,
      status: merge.status,
      notes: merge.notes,
      variantSequence: merge.variantSequence,
    } },
    { session }
  );
  await RouteCorridor.deleteMany(
    { _id: { $in: merge.duplicateIds } }, { session }
  );
}

async function reconcileDuplicateCorridors({ dryRun = true } = {}) {
  const plan = await readPlan();
  if (dryRun || !plan.safeToApply) {
    return { success: plan.safeToApply, dryRun, plan };
  }
  if (plan.merges.length > 0) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const merge of plan.merges) await applyMerge(merge, session);
      });
    } finally {
      await session.endSession();
    }
  }
  const migration = await runCorridorRegistryMigration();
  const verification = await readPlan();
  return {
    success: migration.success && verification.merges.length === 0,
    dryRun: false, plan, migration, verification,
  };
}

module.exports = { applyMerge, readPlan, reconcileDuplicateCorridors };

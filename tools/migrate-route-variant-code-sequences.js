"use strict";

/**
 * Controlled, monotonic backfill for legacy corridor variantSequence values.
 * Default mode is read-only. Pass --apply only after reviewing preflight JSON.
 */

const {
  scanRouteVariantCodeAllocation,
} = require("./preflight-route-variant-code-allocation.js");

function buildCounterBackfillWrites(counterUpdates) {
  return counterUpdates.map((update) => ({
    updateOne: {
      filter: { _id: update.corridorId },
      // `$max` cannot lower a concurrent allocation, so rollout remains safe.
      update: { $max: { variantSequence: update.targetSequence } },
    },
  }));
}

async function applyCounterBackfill(RouteCorridor, counterUpdates) {
  const writes = buildCounterBackfillWrites(counterUpdates);
  if (writes.length === 0) return { matchedCount: 0, modifiedCount: 0 };
  return RouteCorridor.bulkWrite(writes, { ordered: true });
}

async function main() {
  require("dotenv").config();
  const mongoose = require("mongoose");
  const RouteCorridor = require("../models/routeCorridorModel.js");
  const RouteVariant = require("../models/routeVariantModel.js");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  const apply = process.argv.includes("--apply");
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");

  await mongoose.connect(dbUrl);
  try {
    const before = await scanRouteVariantCodeAllocation({ RouteCorridor, RouteVariant });
    if (!apply) {
      console.log(JSON.stringify({ mode: "dry-run", ...before }, null, 2));
      process.exitCode = before.requiresBackfill ? 2 : 0;
      return;
    }

    const writeResult = await applyCounterBackfill(RouteCorridor, before.counterUpdates);
    const after = await scanRouteVariantCodeAllocation({ RouteCorridor, RouteVariant });
    console.log(JSON.stringify({
      mode: "apply",
      before,
      writeResult: {
        matchedCount: writeResult.matchedCount || 0,
        modifiedCount: writeResult.modifiedCount || 0,
      },
      after,
    }, null, 2));
    process.exitCode = after.requiresBackfill ? 2 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Route variant code-sequence migration failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { applyCounterBackfill, buildCounterBackfillWrites };

"use strict";

/**
 * Read-only rollout preflight for per-corridor RouteVariant code counters.
 * Older corridors predate `variantSequence`; run this before deployment so
 * their next allocated code starts after their existing V##-F/R variants.
 */

function serializeId(value) {
  return value === null || value === undefined ? null : String(value);
}

function asNonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function sequenceFromVariantCode(corridorCode, variantCode) {
  const escaped = String(corridorCode).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escaped}-V(\\d+)-(?:F|R)$`, "i")
    .exec(String(variantCode || ""));
  return match ? Number(match[1]) : null;
}

function buildVariantCodeAllocationReport(corridors, variants) {
  const variantsByCorridor = new Map();
  for (const variant of variants) {
    const corridorId = serializeId(variant.corridorId);
    if (!corridorId) continue;
    const current = variantsByCorridor.get(corridorId) || [];
    current.push(variant);
    variantsByCorridor.set(corridorId, current);
  }

  const updates = [];
  const unrecognizedVariantCodes = [];
  for (const corridor of corridors) {
    const corridorId = serializeId(corridor._id);
    const linkedVariants = variantsByCorridor.get(corridorId) || [];
    let observedMaximum = 0;

    for (const variant of linkedVariants) {
      const sequence = sequenceFromVariantCode(corridor.code, variant.code);
      if (sequence === null) {
        unrecognizedVariantCodes.push({
          corridorId,
          corridorCode: corridor.code,
          variantId: serializeId(variant._id),
          variantCode: variant.code || null,
        });
        continue;
      }
      observedMaximum = Math.max(observedMaximum, sequence);
    }

    const currentSequence = asNonNegativeInteger(corridor.variantSequence);
    const targetSequence = Math.max(currentSequence, observedMaximum);
    const fieldIsMissingOrInvalid = !Number.isSafeInteger(Number(corridor.variantSequence)) ||
      Number(corridor.variantSequence) < 0;
    if (fieldIsMissingOrInvalid || targetSequence > currentSequence) {
      updates.push({
        corridorId,
        corridorCode: corridor.code,
        currentSequence: fieldIsMissingOrInvalid ? null : currentSequence,
        observedMaximum,
        targetSequence,
      });
    }
  }

  return {
    preflight: "route-variant-code-allocation",
    requiresBackfill: updates.length > 0,
    safeToAllocateAfterBackfill: true,
    summary: {
      corridorsScanned: corridors.length,
      variantsScanned: variants.length,
      countersNeedingBackfill: updates.length,
      unrecognizedVariantCodes: unrecognizedVariantCodes.length,
    },
    counterUpdates: updates,
    unrecognizedVariantCodes,
  };
}

async function scanRouteVariantCodeAllocation({ RouteCorridor, RouteVariant }) {
  const [corridors, variants] = await Promise.all([
    RouteCorridor.find({}).select("_id code variantSequence").lean(),
    RouteVariant.find({}).select("_id corridorId code").lean(),
  ]);
  return buildVariantCodeAllocationReport(corridors, variants);
}

async function main() {
  require("dotenv").config();
  const mongoose = require("mongoose");
  const RouteCorridor = require("../models/routeCorridorModel.js");
  const RouteVariant = require("../models/routeVariantModel.js");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");

  await mongoose.connect(dbUrl);
  try {
    const report = await scanRouteVariantCodeAllocation({ RouteCorridor, RouteVariant });
    console.log(JSON.stringify(report, null, 2));
    // 0: already backfilled. 2: run the controlled backfill tool first.
    process.exitCode = report.requiresBackfill ? 2 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Route variant code-allocation preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  asNonNegativeInteger,
  buildVariantCodeAllocationReport,
  scanRouteVariantCodeAllocation,
  sequenceFromVariantCode,
};

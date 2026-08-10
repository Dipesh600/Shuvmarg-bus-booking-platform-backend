"use strict";

/**
 * Read-only rollout preflight for the RouteStop { variantId, sequence }
 * uniqueness index. Run this before deploying the index to an existing
 * database; it never writes documents or changes indexes.
 */

function serializeId(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function buildSequencePreflightReport(duplicateGroups) {
  const duplicates = duplicateGroups.map((group) => ({
    variantId: serializeId(group._id?.variantId),
    sequence: group._id?.sequence ?? null,
    count: group.count,
    routeStopIds: (group.routeStopIds || []).map(serializeId),
    stopIds: (group.stopIds || []).map(serializeId),
  }));

  return {
    preflight: "route-variant-sequence-uniqueness",
    safeToApply: duplicates.length === 0,
    summary: {
      duplicateGroups: duplicates.length,
      duplicateRecords: duplicates.reduce((total, duplicate) => total + duplicate.count, 0),
    },
    duplicateSequences: duplicates,
  };
}

async function scanRouteVariantSequenceDuplicates(RouteStop) {
  const duplicateGroups = await RouteStop.aggregate([
    {
      $group: {
        _id: {
          variantId: "$variantId",
          sequence: "$sequence",
        },
        count: { $sum: 1 },
        routeStopIds: { $push: "$_id" },
        stopIds: { $push: "$stopId" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { "_id.variantId": 1, "_id.sequence": 1 } },
  ]);

  return buildSequencePreflightReport(duplicateGroups);
}

async function main() {
  require("dotenv").config();

  const mongoose = require("mongoose");
  const RouteStop = require("../models/routeStopModel.js");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;

  if (!dbUrl) {
    throw new Error("MONGODB_URL or DB_URL is required.");
  }

  await mongoose.connect(dbUrl);
  try {
    const report = await scanRouteVariantSequenceDuplicates(RouteStop);
    console.log(JSON.stringify(report, null, 2));

    // 0: safe to deploy the index. 2: data conflicts need review.
    process.exitCode = report.safeToApply ? 0 : 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Route variant sequence preflight failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSequencePreflightReport,
  scanRouteVariantSequenceDuplicates,
};

"use strict";
const UNFINISHED_DISCOVERY_STATUSES = new Set([
  "DRAFT",
  "ROUTE_SELECTED",
  "STOPS_DISCOVERED",
  "APPROVED",
]);
const KNOWN_DISCOVERY_STATUSES = [
  "DRAFT",
  "ROUTE_SELECTED",
  "STOPS_DISCOVERED",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
];
function serializeId(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}
function normalizeStatus(status) {
  return KNOWN_DISCOVERY_STATUSES.includes(status) ? status : "UNKNOWN";
}
function buildStatusCounts(records) {
  const counts = Object.fromEntries(KNOWN_DISCOVERY_STATUSES.map((status) => [status, 0]));
  counts.UNKNOWN = 0;
  for (const record of records) {
    counts[normalizeStatus(record.status)] += 1;
  }
  return counts;
}
function discoverySummary(record) {
  return {
    discoveryId: serializeId(record._id),
    status: record.status || null,
    originStopId: serializeId(record.originStopId),
    destinationStopId: serializeId(record.destinationStopId),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  };
}
function buildDiscoveryRetirementReport(discoveries, existingVariantIds) {
  const variantIdSet = new Set([...existingVariantIds].map(serializeId).filter(Boolean));
  const unfinishedRecords = [];
  const publishedReferencesMissingVariants = [];
  for (const discovery of discoveries) {
    if (UNFINISHED_DISCOVERY_STATUSES.has(discovery.status)) {
      unfinishedRecords.push(discoverySummary(discovery));
    }
    if (discovery.status !== "PUBLISHED") continue;
    const referenceStatus = discovery.publishedVariant?.referenceStatus;
    const alreadyRetired = referenceStatus === "BROKEN_VARIANT_RETIRED";
    const variantId = serializeId(discovery.publishedVariant?.variantId);
    if (!alreadyRetired && (!variantId || !variantIdSet.has(variantId))) {
      publishedReferencesMissingVariants.push({
        ...discoverySummary(discovery),
        variantId,
        reason: variantId ? "ROUTE_VARIANT_NOT_FOUND" : "MISSING_PUBLISHED_VARIANT_ID",
      });
    }
  }
  const statusCounts = buildStatusCounts(discoveries);
  const unknownStatusCount = statusCounts.UNKNOWN;
  const safeToRetire =
    unfinishedRecords.length === 0 &&
    publishedReferencesMissingVariants.length === 0 &&
    unknownStatusCount === 0;
  return {
    preflight: "legacy-route-discovery-retirement",
    safeToRetire,
    summary: {
      totalDiscoveries: discoveries.length,
      statusCounts,
      unfinishedRecords: unfinishedRecords.length,
      publishedReferencesMissingVariants: publishedReferencesMissingVariants.length,
      unknownStatusRecords: unknownStatusCount,
    },
    unfinishedRecords,
    publishedReferencesMissingVariants,
  };
}
async function scanLegacyRouteDiscoveryRetirement({ RouteDiscovery, RouteVariant }) {
  const discoveries = await RouteDiscovery.find({})
    .select(
      "_id status originStopId destinationStopId publishedVariant.variantId publishedVariant.referenceStatus createdAt updatedAt"
    )
    .lean();
  const publishedVariantIds = discoveries
    .filter((discovery) => discovery.status === "PUBLISHED")
    .map((discovery) => discovery.publishedVariant?.variantId)
    .filter(Boolean);
  const variants = publishedVariantIds.length
    ? await RouteVariant.find({ _id: { $in: publishedVariantIds } }).select("_id").lean()
    : [];
  return buildDiscoveryRetirementReport(
    discoveries,
    variants.map((variant) => variant._id)
  );
}
async function main() {
  require("dotenv").config();
  const mongoose = require("mongoose");
  const RouteDiscovery = require("../models/legacyRouteDiscoveryModel.js");
  const RouteVariant = require("../models/routeVariantModel.js");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!dbUrl) {
    throw new Error("MONGODB_URL or DB_URL is required.");
  }
  await mongoose.connect(dbUrl);
  try {
    const report = await scanLegacyRouteDiscoveryRetirement({
      RouteDiscovery,
      RouteVariant,
    });
    console.log(JSON.stringify(report, null, 2));
    // 0: no unfinished or broken legacy discovery records. 2: human review required.
    process.exitCode = report.safeToRetire ? 0 : 2;
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error("Legacy Route Discovery retirement preflight failed:", error.message);
    process.exitCode = 1;
  });
}
module.exports = {
  UNFINISHED_DISCOVERY_STATUSES,
  buildDiscoveryRetirementReport,
  buildStatusCounts,
  scanLegacyRouteDiscoveryRetirement,
};

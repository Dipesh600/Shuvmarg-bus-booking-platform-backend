"use strict";

const { createHash } = require("node:crypto");
const RouteStop = require("../../../../models/routeStopModel.js");
const RouteVariant = require("../../../../models/routeVariantModel.js");
const { routeVariantError } = require("./route-variant-errors.js");

function fingerprintStopIds(stopIds) {
  const normalized = stopIds.map(String);
  if (normalized.length < 2 || new Set(normalized).size !== normalized.length) {
    throw routeVariantError("INVALID_ROUTE_STOP_SEQUENCE", "A route path needs at least two unique Stops.");
  }
  return createHash("sha256").update(normalized.join(">")).digest("hex");
}

async function sequenceIdentity(variantId) {
  const rows = await RouteStop.find({ variantId }).sort({ sequence: 1 }).select("stopId").lean();
  return { stopIds: rows.map((row) => String(row.stopId)), fingerprint: fingerprintStopIds(rows.map((row) => row.stopId)) };
}

function orderedOverlap(left, right) {
  if (!left.length || !right.length) return 0;
  let cursor = 0;
  let matches = 0;
  for (const value of left) {
    while (cursor < right.length && right[cursor] !== value) cursor += 1;
    if (cursor < right.length) { matches += 1; cursor += 1; }
  }
  return matches / Math.min(left.length, right.length);
}

async function assertNoLivePathDuplicate(variant) {
  const identity = await sequenceIdentity(variant._id);
  const live = await RouteVariant.find({
    _id: { $ne: variant._id }, corridorId: variant.corridorId,
    direction: variant.direction, status: "ACTIVE",
  }).select("_id code name pathFingerprint").lean();
  const exact = live.find((item) => item.pathFingerprint === identity.fingerprint);
  if (exact) {
    throw routeVariantError("DUPLICATE_ACTIVE_ROUTE_PATH", "This road path is already live. Open or revise the existing variant instead.", 409, { existingVariantId: String(exact._id), existingVariantCode: exact.code });
  }
  for (const item of live) {
    const other = await sequenceIdentity(item._id);
    if (other.stopIds[0] === identity.stopIds[0] && other.stopIds.at(-1) === identity.stopIds.at(-1) &&
        orderedOverlap(identity.stopIds, other.stopIds) >= 0.8) {
      throw routeVariantError("PROBABLE_DUPLICATE_ROUTE_PATH", "A substantially identical live road path already exists. Revise it instead of publishing another variant.", 409, { existingVariantId: String(item._id), existingVariantCode: item.code });
    }
  }
  return identity;
}

module.exports = { assertNoLivePathDuplicate, fingerprintStopIds, orderedOverlap, sequenceIdentity };

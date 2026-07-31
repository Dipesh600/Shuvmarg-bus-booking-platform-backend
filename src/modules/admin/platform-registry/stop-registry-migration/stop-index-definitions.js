"use strict";

/**
 * Index definitions managed by the Stop Registry migration.
 *
 * These are the ONLY indexes this migration will create, remove, or verify.
 * Every other index on the Stop collection is treated as unrelated and must
 * be preserved unchanged.
 */
const STOP_REGISTRY_INDEXES = {
  /**
   * Legacy name-lower index created by the original Stop schema.
   * This migration removes it.
   */
  legacyName: {
    name: "_nameLower_1"
  },

  /**
   * Normalized identity unique index — the canonical uniqueness constraint
   * for the Stop Registry after this migration.
   */
  normalizedIdentity: {
    name: "_normalizedIdentity_1",
    key: { _normalizedIdentity: 1 },
    options: { unique: true, name: "_normalizedIdentity_1" }
  },

  /**
   * Compound index used by route-stop hierarchy queries.
   */
  parentStatus: {
    name: "parentStopId_1_status_1",
    key: { parentStopId: 1, status: 1 },
    options: { name: "parentStopId_1_status_1" }
  }
};

/**
 * Returns true if the index document's key matches the expected key object
 * (same fields, same order, same direction).
 */
function indexKeyMatches(indexDoc, expectedKey) {
  const docKeys = Object.entries(indexDoc.key || {});
  const expKeys = Object.entries(expectedKey);
  if (docKeys.length !== expKeys.length) return false;
  return expKeys.every(([field, dir], i) =>
    docKeys[i] && docKeys[i][0] === field && docKeys[i][1] === dir
  );
}

module.exports = { STOP_REGISTRY_INDEXES, indexKeyMatches };

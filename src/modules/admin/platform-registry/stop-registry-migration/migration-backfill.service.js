"use strict";

const Stop = require("../../../../../models/stopModel");

/**
 * Migration Phase 3 — Apply backfill updates.
 *
 * Receives the list of { id, updates } objects produced by the scan phase
 * and applies them as explicit bulk writes. Never deletes or merges records.
 *
 * Returns matched/modified/unchanged counts.
 */
async function applyStopBackfill(plannedUpdates) {
  if (plannedUpdates.length === 0) {
    return { matched: 0, modified: 0, unchanged: 0 };
  }

  const bulkOps = plannedUpdates.map(doc => ({
    updateOne: {
      filter: { _id: doc.id },
      update: { $set: doc.updates }
    }
  }));

  const result = await Stop.collection.bulkWrite(bulkOps);

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    unchanged: result.matchedCount - result.modifiedCount
  };
}

module.exports = { applyStopBackfill };

"use strict";

const Stop = require("../../../../../models/stopModel");

async function applyStopBackfill(plannedUpdates = []) {
  if (!Array.isArray(plannedUpdates) || plannedUpdates.length === 0) {
    return { matched: 0, modified: 0, unchanged: 0 };
  }

  const bulkOps = plannedUpdates.map((doc) => ({
    updateOne: {
      filter: { _id: doc.id },
      update: { $set: doc.updates },
    },
  }));

  const result = await Stop.collection.bulkWrite(bulkOps);

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    unchanged: result.matchedCount - result.modifiedCount,
  };
}

module.exports = { applyStopBackfill };

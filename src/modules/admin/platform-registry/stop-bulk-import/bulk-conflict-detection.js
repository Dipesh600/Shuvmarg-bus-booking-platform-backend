"use strict";

const Stop = require("../../../../../models/stopModel.js");

async function queryDatabaseConflicts(codesToQuery, identitiesToQuery) {
  return await Stop.find({
    $or: [
      { code: { $in: codesToQuery } },
      { _normalizedIdentity: { $in: identitiesToQuery } }
    ]
  }).select("code _normalizedIdentity name district municipality parentStopId").lean();
}

function detectBatchConflicts(enrichedValid) {
  const batchCodes = new Set();
  const batchIdentities = new Set();
  const codesToQuery = [];
  const identitiesToQuery = [];
  const duplicateWithinBatch = [];

  for (const entry of enrichedValid) {
    codesToQuery.push(entry.code);
    identitiesToQuery.push(entry._normalizedIdentity);

    if (batchCodes.has(entry.code)) {
      duplicateWithinBatch.push({ ...entry, conflictReason: "CODE_CONFLICT" });
    } else if (batchIdentities.has(entry._normalizedIdentity)) {
      duplicateWithinBatch.push({ ...entry, conflictReason: "IDENTITY_CONFLICT" });
    } else {
      batchCodes.add(entry.code);
      batchIdentities.add(entry._normalizedIdentity);
    }
  }

  return {
    codesToQuery,
    identitiesToQuery,
    duplicateWithinBatch,
    batchCodes,
    batchIdentities
  };
}

module.exports = {
  queryDatabaseConflicts,
  detectBatchConflicts
};

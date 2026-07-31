"use strict";

const { validateBatch } = require("../stop-bulk-import.policy.js");
const { formatError } = require("./bulk-error-mapper.js");
const { splitEntries, prepareEnrichedValidEntries } = require("./bulk-entry-preparation.js");
const { detectBatchConflicts, queryDatabaseConflicts } = require("./bulk-conflict-detection.js");

async function bulkPreviewStops(rawStops) {
  validateBatch(rawStops, true);
  const { invalid, valid } = splitEntries(rawStops);

  const invalidRows = invalid.map((row) => {
    const err = formatError(row.raw, "INVALID_STOP_DATA", row.error);
    err.index = row._sourceIndex;
    return err;
  });

  if (valid.length === 0) {
    return {
      toInsert: [], duplicateCode: [], duplicateIdentity: [], duplicateWithinBatch: [], invalid: invalidRows,
      summary: {
        total: rawStops.length, new: 0, skippedCode: 0,
        skippedIdentity: 0, skippedBatch: 0, invalid: invalid.length,
      },
    };
  }

  const enrichedValid = prepareEnrichedValidEntries(valid, invalidRows, formatError);

  const { codesToQuery, identitiesToQuery, duplicateWithinBatch } = detectBatchConflicts(enrichedValid);

  const dbConflicts = await queryDatabaseConflicts(codesToQuery, identitiesToQuery);

  const dbCodeMap = new Map();
  const dbIdentityMap = new Map();
  for (const stop of dbConflicts) {
    dbCodeMap.set(stop.code, stop);
    dbIdentityMap.set(stop._normalizedIdentity, stop);
  }

  const toInsert = [];
  const duplicateCode = [];
  const duplicateIdentity = [];

  for (const entry of enrichedValid) {
    if (duplicateWithinBatch.find(d => d._sourceIndex === entry._sourceIndex)) continue;

    if (dbCodeMap.has(entry.code)) {
      duplicateCode.push({ ...entry, existingStop: dbCodeMap.get(entry.code) });
    } else if (dbIdentityMap.has(entry._normalizedIdentity)) {
      duplicateIdentity.push({ ...entry, existingStop: dbIdentityMap.get(entry._normalizedIdentity) });
    } else {
      toInsert.push(entry);
    }
  }

  return {
    toInsert, duplicateCode, duplicateIdentity, duplicateWithinBatch, invalid: invalidRows,
    summary: {
      total: rawStops.length,
      new: toInsert.length,
      skippedCode: duplicateCode.length,
      skippedIdentity: duplicateIdentity.length,
      skippedBatch: duplicateWithinBatch.length,
      invalid: invalidRows.length,
    },
  };
}

module.exports = { bulkPreviewStops };

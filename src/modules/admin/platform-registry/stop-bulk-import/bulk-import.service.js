"use strict";

const Stop = require("../../../../../models/stopModel.js");
const logger = require("../../../../../utils/logger.js");
const { validateBatch } = require("../stop-bulk-import.policy.js");
const { buildStopIdentity } = require("../stop-identity.js");
const { formatError, mapBulkWriteError } = require("./bulk-error-mapper.js");
const { splitEntries, stripSourceIndex } = require("./bulk-entry-preparation.js");
const { queryDatabaseConflicts } = require("./bulk-conflict-detection.js");

async function bulkImportStops(rawStops, adminId) {
  validateBatch(rawStops);
  const { invalid, valid } = splitEntries(rawStops);

  const errors = invalid.map((row) => {
    const err = formatError(row.raw, "INVALID_STOP_DATA", row.error);
    err.index = row._sourceIndex;
    return err;
  });

  if (valid.length === 0) {
    throw new Error("No valid entries to import after validation.");
  }

  const codesToQuery = [];
  const identitiesToQuery = [];
  const batchCodes = new Set();
  const batchIdentities = new Set();
  const preparedValid = [];

  for (const entry of valid) {
    try {
      const identity = buildStopIdentity(entry);
      const preparedEntry = { ...entry, _normalizedIdentity: identity };

      if (batchCodes.has(entry.code)) {
        errors.push(formatError(preparedEntry, "DUPLICATE_WITHIN_BATCH", "Duplicate code in this batch"));
        continue;
      }
      if (batchIdentities.has(identity)) {
        errors.push(formatError(preparedEntry, "DUPLICATE_WITHIN_BATCH", "Duplicate identity in this batch"));
        continue;
      }

      batchCodes.add(entry.code);
      batchIdentities.add(identity);
      codesToQuery.push(entry.code);
      identitiesToQuery.push(identity);
      preparedValid.push(preparedEntry);
    } catch (error) {
      errors.push(formatError(entry, "INVALID_STOP_DATA", error.message));
    }
  }

  const dbConflicts = await queryDatabaseConflicts(codesToQuery, identitiesToQuery);
  const dbCodeSet = new Set(dbConflicts.map((s) => s.code));
  const dbIdentitySet = new Set(dbConflicts.map((s) => s._normalizedIdentity));

  const insertionBatch = [];

  for (const entry of preparedValid) {
    if (dbCodeSet.has(entry.code)) {
      errors.push(formatError(entry, "STOP_CODE_CONFLICT", "Code already exists in database"));
      continue;
    }
    if (dbIdentitySet.has(entry._normalizedIdentity)) {
      errors.push(formatError(entry, "STOP_IDENTITY_CONFLICT", "A stop with this identity already exists"));
      continue;
    }

    const cleanEntry = stripSourceIndex(entry);
    const stopDoc = new Stop({ ...cleanEntry, createdBy: adminId || null });
    try {
      await stopDoc.validate();
      insertionBatch.push({
        sourceIndex: entry._sourceIndex,
        originalEntry: entry,
        document: stopDoc.toObject(),
      });
    } catch (err) {
      errors.push(formatError(entry, "INVALID_STOP_DATA", err.message));
    }
  }

  if (insertionBatch.length === 0) {
    return {
      inserted: 0,
      skipped: rawStops.length,
      invalidCount: errors.length,
      errors,
    };
  }

  let inserted = 0;
  try {
    const docsToInsert = insertionBatch.map((item) => item.document);
    const result = await Stop.insertMany(docsToInsert, { ordered: false });
    inserted = result.length;
  } catch (error) {
    if (!error.writeErrors) throw error;
    inserted = error.insertedDocs?.length ?? (insertionBatch.length - error.writeErrors.length);
    for (const writeError of error.writeErrors) {
      const failedItem = insertionBatch[writeError.index];
      const originalEntry = failedItem ? failedItem.originalEntry : null;
      logger.error("Stop bulk import write failed", {
        error,
        mongoCode: writeError?.code,
        writeIndex: writeError?.index,
        sourceIndex: originalEntry?._sourceIndex,
        stopCode: originalEntry?.code,
        stopName: originalEntry?.name,
      });
      errors.push(mapBulkWriteError(writeError, originalEntry));
    }
  }

  return {
    inserted,
    skipped: rawStops.length - inserted,
    invalidCount: errors.length,
    errors,
  };
}

module.exports = { bulkImportStops };

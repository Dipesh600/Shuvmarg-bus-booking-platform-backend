"use strict";

const Stop = require("../../../../../models/stopModel.js");
const { validateBatch } = require("../stop-bulk-import.policy.js");
const { buildStopIdentity } = require("../stop-identity.js");
const { formatError } = require("./bulk-error-mapper.js");
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
  const toInsertCandidates = [];

  for (const entry of valid) {
    try {
      const identity = buildStopIdentity(entry);
      entry._normalizedIdentity = identity;

      if (batchCodes.has(entry.code)) {
        errors.push(formatError(entry, "DUPLICATE_WITHIN_BATCH", "Duplicate code in this batch"));
        continue;
      }
      if (batchIdentities.has(identity)) {
        errors.push(formatError(entry, "DUPLICATE_WITHIN_BATCH", "Duplicate identity in this batch"));
        continue;
      }

      batchCodes.add(entry.code);
      batchIdentities.add(identity);
      codesToQuery.push(entry.code);
      identitiesToQuery.push(identity);
      toInsertCandidates.push(entry);
    } catch (error) {
      errors.push(formatError(entry, "INVALID_STOP_DATA", error.message));
    }
  }

  const dbConflicts = await queryDatabaseConflicts(codesToQuery, identitiesToQuery);
  const dbCodeSet = new Set(dbConflicts.map((s) => s.code));
  const dbIdentitySet = new Set(dbConflicts.map((s) => s._normalizedIdentity));

  const validToInsert = [];

  for (const entry of toInsertCandidates) {
    if (dbCodeSet.has(entry.code)) {
      errors.push(formatError(entry, "STOP_CODE_CONFLICT", "Code already exists in database"));
      continue;
    }
    if (dbIdentitySet.has(entry._normalizedIdentity)) {
      errors.push(formatError(entry, "STOP_IDENTITY_CONFLICT", "A stop with this identity already exists"));
      continue;
    }

    // Strip _sourceIndex before building Mongoose document so it's never stored in DB
    const cleanEntry = stripSourceIndex(entry);
    const stopDoc = new Stop({ ...cleanEntry, createdBy: adminId || null });
    try {
      await stopDoc.validate();
      validToInsert.push(stopDoc.toObject());
    } catch (err) {
      errors.push(formatError(entry, "INVALID_STOP_DATA", err.message));
    }
  }

  if (validToInsert.length === 0) {
    return {
      inserted: 0,
      skipped: rawStops.length,
      invalidCount: errors.length,
      errors,
    };
  }

  let inserted = 0;
  try {
    const result = await Stop.insertMany(validToInsert, { ordered: false });
    inserted = result.length;
  } catch (error) {
    if (!error.writeErrors) throw error;
    inserted = error.insertedDocs?.length ?? 0;
    for (const writeError of error.writeErrors) {
      const failedEntry = validToInsert[writeError.index];
      let errorCode = "WRITE_ERROR";
      let message = writeError.errmsg || "Write error";

      if (writeError.code === 11000) {
        if (message.includes("code_1")) {
          errorCode = "STOP_CODE_CONFLICT";
        } else if (message.includes("_normalizedIdentity_1")) {
          errorCode = "STOP_IDENTITY_CONFLICT";
        }
      }
      errors.push(formatError(failedEntry, errorCode, message));
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

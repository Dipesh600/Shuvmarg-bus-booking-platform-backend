"use strict";

const Stop = require("../../../../models/stopModel.js");
const { validateBatch, sanitizeEntry } = require("./stop-bulk-import.policy.js");
const { buildStopIdentity } = require("./stop-identity.js");

function formatError(entry, errorCode, message, details = {}) {
  return {
    index: entry?._sourceIndex ?? null,
    code: entry?.code ?? null,
    name: entry?.name ?? null,
    errorCode,
    message,
    details: {
      province: entry?.province,
      district: entry?.district,
      municipality: entry?.municipality,
      parentStopId: entry?.parentStopId,
      ...details
    }
  };
}

function splitEntries(rawStops) {
  const rows = rawStops.map((raw, index) => sanitizeEntry(raw, index));
  return {
    invalid: rows.filter((row) => !row.ok),
    valid: rows.filter((row) => row.ok).map((row) => row.entry),
  };
}

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

  const toInsert = [];
  const duplicateCode = [];
  const duplicateIdentity = [];
  const duplicateWithinBatch = [];
  
  const batchCodes = new Set();
  const batchIdentities = new Set();

  const codesToQuery = [];
  const identitiesToQuery = [];

  const enrichedValid = valid.map(entry => {
    try {
      const identity = buildStopIdentity(entry);
      return { ...entry, _normalizedIdentity: identity };
    } catch (error) {
      invalidRows.push(formatError(entry, "INVALID_STOP_DATA", error.message));
      return null;
    }
  }).filter(Boolean);

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

  const dbConflicts = await Stop.find({
    $or: [
      { code: { $in: codesToQuery } },
      { _normalizedIdentity: { $in: identitiesToQuery } }
    ]
  }).select("code _normalizedIdentity name district municipality parentStopId").lean();

  const dbCodeMap = new Map();
  const dbIdentityMap = new Map();
  for (const stop of dbConflicts) {
    dbCodeMap.set(stop.code, stop);
    dbIdentityMap.set(stop._normalizedIdentity, stop);
  }

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

  const dbConflicts = await Stop.find({
    $or: [
      { code: { $in: codesToQuery } },
      { _normalizedIdentity: { $in: identitiesToQuery } }
    ]
  }).select("code _normalizedIdentity").lean();

  const dbCodeSet = new Set(dbConflicts.map(s => s.code));
  const dbIdentitySet = new Set(dbConflicts.map(s => s._normalizedIdentity));

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
    
    const stopDoc = new Stop({ ...entry, createdBy: adminId || null });
    try {
      await stopDoc.validate();
      validToInsert.push(stopDoc.toObject());
    } catch (err) {
      errors.push(formatError(entry, "INVALID_STOP_DATA", err.message));
    }
  }

  if (validToInsert.length === 0) {
    return {
      inserted: 0, skipped: rawStops.length - validToInsert.length,
      invalidCount: errors.length, errors,
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
      // attempt to figure out which it is
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
    inserted, skipped: rawStops.length - inserted,
    invalidCount: errors.length, errors,
  };
}

module.exports = { bulkPreviewStops, bulkImportStops };

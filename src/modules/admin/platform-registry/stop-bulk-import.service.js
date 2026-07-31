"use strict";

const Stop = require("../../../../models/stopModel.js");
const { validateBatch, sanitizeEntry } = require("./stop-bulk-import.policy.js");
const { buildStopIdentity } = require("./stop-identity.js");

function splitEntries(rawStops) {
  const rows = rawStops.map(sanitizeEntry);
  return {
    invalid: rows.filter((row) => !row.ok),
    valid: rows.filter((row) => row.ok).map((row) => row.entry),
  };
}

async function bulkPreviewStops(rawStops) {
  validateBatch(rawStops, true);
  const { invalid, valid } = splitEntries(rawStops);
  const invalidRows = invalid.map((row) => ({ error: row.error, raw: row.raw }));

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

  // Add _normalizedIdentity and detect batch conflicts
  const enrichedValid = valid.map(entry => {
    try {
      const identity = buildStopIdentity(entry);
      return { ...entry, _normalizedIdentity: identity };
    } catch (error) {
      invalidRows.push({ error: error.message, raw: entry });
      return null;
    }
  }).filter(Boolean);

  for (const entry of enrichedValid) {
    codesToQuery.push(entry.code);
    identitiesToQuery.push(entry._normalizedIdentity);
    
    if (batchCodes.has(entry.code) || batchIdentities.has(entry._normalizedIdentity)) {
      duplicateWithinBatch.push(entry);
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
  }).select("code _normalizedIdentity name").lean();

  const dbCodeMap = new Map();
  const dbIdentityMap = new Map();
  for (const stop of dbConflicts) {
    dbCodeMap.set(stop.code, stop);
    dbIdentityMap.set(stop._normalizedIdentity, stop);
  }

  for (const entry of enrichedValid) {
    if (duplicateWithinBatch.includes(entry)) continue;
    
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
  
  const invalidRows = invalid.map((row) => ({ error: row.error, raw: row.raw }));

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
      
      if (batchCodes.has(entry.code) || batchIdentities.has(identity)) {
        invalidRows.push({ error: "Duplicate within batch", raw: entry });
        continue;
      }
      
      batchCodes.add(entry.code);
      batchIdentities.add(identity);
      codesToQuery.push(entry.code);
      identitiesToQuery.push(identity);
      toInsertCandidates.push(entry);
    } catch (error) {
      invalidRows.push({ error: error.message, raw: entry });
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
  const errors = [];
  
  for (const entry of toInsertCandidates) {
    if (dbCodeSet.has(entry.code)) {
      errors.push({ code: entry.code, error: "Code already exists in database" });
      continue;
    }
    if (dbIdentitySet.has(entry._normalizedIdentity)) {
      errors.push({ code: entry.code, error: "A stop with this identity already exists" });
      continue;
    }
    
    // Model Validation before insert
    const stopDoc = new Stop({ ...entry, createdBy: adminId || null });
    try {
      await stopDoc.validate();
      validToInsert.push(stopDoc.toObject());
    } catch (err) {
      errors.push({ code: entry.code, error: err.message });
    }
  }

  if (validToInsert.length === 0) {
    return {
      inserted: 0, skipped: rawStops.length - validToInsert.length - invalidRows.length,
      invalidCount: invalidRows.length, errors,
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
      errors.push({
        code: validToInsert[writeError.index]?.code,
        error: writeError.errmsg || "Write error",
      });
    }
  }

  return {
    inserted, skipped: rawStops.length - inserted - invalidRows.length,
    invalidCount: invalidRows.length, errors,
  };
}

module.exports = { bulkPreviewStops, bulkImportStops };

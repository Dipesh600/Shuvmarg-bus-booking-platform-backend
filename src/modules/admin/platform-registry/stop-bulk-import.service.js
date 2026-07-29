"use strict";

const Stop = require("../../../../models/stopModel.js");
const { validateBatch, sanitizeEntry } = require("./stop-bulk-import.policy.js");

function splitEntries(rawStops) {
  const rows = rawStops.map(sanitizeEntry);
  return {
    invalid: rows.filter((row) => !row.ok),
    valid: rows.filter((row) => row.ok).map((row) => row.entry),
  };
}

function namesFor(entry) {
  return [entry.name.toLowerCase(), ...(entry.aliases || []).map((a) => a.toLowerCase())];
}

function nameRegex(names) {
  return { $regex: names.map((name) => `^${name}$`).join("|"), $options: "i" };
}

async function findExisting(valid, selectCodes, selectNames) {
  const codes = valid.map((entry) => entry.code);
  const names = valid.flatMap(namesFor);
  return Promise.all([
    Stop.find({ code: { $in: codes } }).select(selectCodes).lean(),
    Stop.find({
      $or: [{ name: nameRegex(names) }, { aliases: nameRegex(names) }],
    }).select(selectNames).lean(),
  ]);
}

function existingSets(existingByCodes, existingByNames) {
  return {
    codes: new Set(existingByCodes.map((stop) => stop.code)),
    names: new Set(existingByNames.flatMap(namesFor)),
  };
}

async function bulkPreviewStops(rawStops) {
  validateBatch(rawStops, true);
  const { invalid, valid } = splitEntries(rawStops);
  const invalidRows = invalid.map((row) => ({ error: row.error, raw: row.raw }));
  if (valid.length === 0) {
    return {
      toInsert: [], duplicateCode: [], duplicateName: [], invalid: invalidRows,
      summary: {
        total: rawStops.length, new: 0, skippedCode: 0,
        skippedName: 0, invalid: invalid.length,
      },
    };
  }
  const [byCodes, byNames] = await findExisting(
    valid, "code name aliases", "code name aliases"
  );
  const sets = existingSets(byCodes, byNames);
  const toInsert = [];
  const duplicateCode = [];
  const duplicateName = [];
  for (const entry of valid) {
    const entryNames = namesFor(entry);
    if (sets.codes.has(entry.code)) {
      const match = byCodes.find((stop) => stop.code === entry.code);
      duplicateCode.push({ ...entry, existingName: match?.name });
    } else if (entryNames.some((name) => sets.names.has(name))) {
      const match = byNames.find((stop) =>
        namesFor(stop).some((name) => entryNames.includes(name))
      );
      duplicateName.push({ ...entry, existingCode: match?.code });
    } else {
      toInsert.push(entry);
    }
  }
  return {
    toInsert, duplicateCode, duplicateName, invalid: invalidRows,
    summary: {
      total: rawStops.length, new: toInsert.length,
      skippedCode: duplicateCode.length, skippedName: duplicateName.length,
      invalid: invalid.length,
    },
  };
}

async function bulkImportStops(rawStops, adminId) {
  validateBatch(rawStops);
  const { invalid, valid } = splitEntries(rawStops);
  if (valid.length === 0) {
    throw new Error("No valid entries to import after validation.");
  }
  const [byCodes, byNames] = await findExisting(valid, "code", "name aliases");
  const sets = existingSets(byCodes, byNames);
  const toInsert = valid
    .filter((entry) =>
      !sets.codes.has(entry.code) &&
      !namesFor(entry).some((name) => sets.names.has(name))
    )
    .map((entry) => ({ ...entry, createdBy: adminId || null }));
  if (toInsert.length === 0) {
    return {
      inserted: 0, skipped: valid.length,
      invalidCount: invalid.length, errors: [],
    };
  }
  let inserted = 0;
  const errors = [];
  try {
    inserted = (await Stop.insertMany(toInsert, { ordered: false })).length;
  } catch (error) {
    if (!error.writeErrors) throw error;
    inserted = error.insertedDocs?.length ?? 0;
    for (const writeError of error.writeErrors) {
      errors.push({
        code: toInsert[writeError.index]?.code,
        error: writeError.errmsg || "Write error",
      });
    }
  }
  return {
    inserted, skipped: valid.length - toInsert.length,
    invalidCount: invalid.length, errors,
  };
}

module.exports = { bulkPreviewStops, bulkImportStops };

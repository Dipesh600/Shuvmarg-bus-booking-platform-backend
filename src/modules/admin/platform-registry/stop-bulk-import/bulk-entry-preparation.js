"use strict";

const { sanitizeEntry } = require("../stop-bulk-import.policy.js");
const { buildStopIdentity } = require("../stop-identity.js");

function splitEntries(rawStops) {
  const rows = rawStops.map((raw, index) => sanitizeEntry(raw, index));
  return {
    invalid: rows.filter((row) => !row.ok),
    valid: rows.filter((row) => row.ok).map((row) => row.entry),
  };
}

function prepareEnrichedValidEntries(valid, invalidRows, formatError) {
  return valid.map(entry => {
    try {
      const identity = buildStopIdentity(entry);
      return { ...entry, _normalizedIdentity: identity };
    } catch (error) {
      invalidRows.push(formatError(entry, "INVALID_STOP_DATA", error.message));
      return null;
    }
  }).filter(Boolean);
}

function stripSourceIndex(entry) {
  if (!entry) return entry;
  const { _sourceIndex, ...clean } = entry;
  return clean;
}

module.exports = {
  splitEntries,
  prepareEnrichedValidEntries,
  stripSourceIndex
};

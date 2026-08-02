"use strict";

const { STOP_REGISTRY_INDEXES, indexKeyMatches } = require("./stop-index-definitions");

async function verifyIndexOutcome(collection, preservedNames) {
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;
  const finalIndexes = await collection.indexes();
  const finalMap = new Map(finalIndexes.map((i) => [i.name, i]));
  const errors = [];

  if (finalMap.has(legacyName.name)) {
    errors.push(`${legacyName.name} still exists after migration.`);
  }

  const identityDoc = finalMap.get(normalizedIdentity.name);
  if (!identityDoc) {
    errors.push(`${normalizedIdentity.name} index is missing.`);
  } else {
    if (!identityDoc.unique) {
      errors.push(`${normalizedIdentity.name} exists but is not unique.`);
    }
    if (!indexKeyMatches(identityDoc, normalizedIdentity.key)) {
      errors.push(`${normalizedIdentity.name} exists but has incorrect key.`);
    }
  }

  const parentDoc = finalMap.get(parentStatus.name);
  if (!parentDoc) {
    errors.push(`${parentStatus.name} index is missing.`);
  } else if (!indexKeyMatches(parentDoc, parentStatus.key)) {
    errors.push(`${parentStatus.name} exists but has incorrect key.`);
  }

  if (Array.isArray(preservedNames)) {
    for (const name of preservedNames) {
      if (!finalMap.has(name)) {
        errors.push(`Unrelated index "${name}" disappeared during migration.`);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

module.exports = { verifyIndexOutcome };

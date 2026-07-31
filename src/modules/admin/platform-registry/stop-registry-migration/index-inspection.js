"use strict";

const { STOP_REGISTRY_INDEXES, indexKeyMatches } = require("./stop-index-definitions");

async function inspectStopIndexes(collection) {
  const allIndexes = await collection.indexes();
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;

  const legacyIndex = allIndexes.find((i) => i.name === legacyName.name) || null;

  const identityIndexDoc = allIndexes.find((i) => i.name === normalizedIdentity.name) || null;
  const identityExists = identityIndexDoc !== null;
  const identityUnique = identityExists ? identityIndexDoc.unique === true : false;
  const identityKeyCorrect = identityExists
    ? indexKeyMatches(identityIndexDoc, normalizedIdentity.key)
    : false;
  const identityCorrect = identityExists && identityUnique && identityKeyCorrect;

  const parentIndexDoc = allIndexes.find(
    (i) =>
      i.name === parentStatus.name ||
      (i.key && i.key.parentStopId === 1 && i.key.status === 1)
  ) || null;
  const parentExists = parentIndexDoc !== null;
  const parentKeyCorrect = parentExists
    ? indexKeyMatches(parentIndexDoc, parentStatus.key)
    : false;
  const parentCorrect = parentExists && parentKeyCorrect;

  const managedNames = new Set([
    legacyName.name,
    normalizedIdentity.name,
    parentStatus.name,
  ]);
  if (parentIndexDoc && !managedNames.has(parentIndexDoc.name)) {
    managedNames.add(parentIndexDoc.name);
  }

  const preservedIndexes = allIndexes.filter((i) => !managedNames.has(i.name));

  return {
    found: allIndexes,
    legacyIndexExists: legacyIndex !== null,
    normalizedIdentity: {
      exists: identityExists,
      unique: identityUnique,
      keyCorrect: identityKeyCorrect,
      correct: identityCorrect,
      doc: identityIndexDoc,
    },
    parentStatus: {
      exists: parentExists,
      keyCorrect: parentKeyCorrect,
      correct: parentCorrect,
      doc: parentIndexDoc,
    },
    preservedIndexes,
  };
}

module.exports = { inspectStopIndexes };

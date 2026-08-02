"use strict";

const { STOP_REGISTRY_INDEXES } = require("./stop-index-definitions");
const { indexConfigError } = require("./migration-errors");

function buildIndexPlan(inspection) {
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;
  const invalidIndexes = [];
  const indexesToRemove = [];
  const indexesToCreate = [];
  const indexesAlreadyCorrect = [];

  if (inspection.legacyIndexExists) {
    indexesToRemove.push(legacyName.name);
  }

  if (!inspection.normalizedIdentity.exists) {
    indexesToCreate.push(normalizedIdentity);
  } else if (inspection.normalizedIdentity.correct) {
    indexesAlreadyCorrect.push(normalizedIdentity.name);
  } else {
    const issues = [];
    if (!inspection.normalizedIdentity.unique) issues.push("not unique");
    if (!inspection.normalizedIdentity.keyCorrect) issues.push("wrong key");
    invalidIndexes.push(
      indexConfigError(
        normalizedIdentity.name,
        `Index is misconfigured (${issues.join(", ")}). Aborting to prevent data loss.`
      )
    );
  }

  if (!inspection.parentStatus.exists) {
    indexesToCreate.push(parentStatus);
  } else if (inspection.parentStatus.correct) {
    indexesAlreadyCorrect.push(parentStatus.name);
  } else {
    invalidIndexes.push(
      indexConfigError(
        parentStatus.name,
        "Index is misconfigured (wrong key). Aborting to prevent data loss."
      )
    );
  }

  return {
    ok: invalidIndexes.length === 0,
    invalidIndexes,
    indexesToRemove,
    indexesToCreate,
    indexesAlreadyCorrect,
    preservedIndexes: inspection.preservedIndexes,
  };
}

module.exports = { buildIndexPlan };

"use strict";

const { STOP_REGISTRY_INDEXES, indexKeyMatches } = require("./stop-index-definitions");
const { indexConfigError } = require("./migration-errors");

/**
 * Migration Phase 4 — Explicit index management.
 *
 * Three steps exposed as separate functions so callers can dry-run:
 *
 *   1. inspectStopIndexes(collection)  → inspection
 *   2. buildIndexPlan(inspection)      → plan  (aborts if invalid state found)
 *   3. applyIndexPlan(collection, plan) → result
 *
 * A fourth function verifies the outcome after apply:
 *   4. verifyIndexOutcome(collection, plan, preSnapshot)
 *
 * NEVER calls syncIndexes() or createIndexes().
 * NEVER removes unrelated indexes.
 */

// ─── 1. Inspect ──────────────────────────────────────────────────────────────

/**
 * Read the current collection index list and classify each index relative to
 * the ones this migration manages.
 *
 * @param {Collection} collection — raw Mongoose collection object
 * @returns {Object} inspection result
 */
async function inspectStopIndexes(collection) {
  const allIndexes = await collection.indexes();
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;

  const legacyIndex = allIndexes.find(i => i.name === legacyName.name) || null;

  const identityIndexDoc = allIndexes.find(i => i.name === normalizedIdentity.name) || null;
  const identityExists = identityIndexDoc !== null;
  const identityUnique = identityExists ? identityIndexDoc.unique === true : false;
  const identityKeyCorrect = identityExists
    ? indexKeyMatches(identityIndexDoc, normalizedIdentity.key)
    : false;
  const identityCorrect = identityExists && identityUnique && identityKeyCorrect;

  const parentIndexDoc = allIndexes.find(
    i => i.name === parentStatus.name ||
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
    parentStatus.name
  ]);
  // Also catch the parent index if found under a different name
  if (parentIndexDoc && !managedNames.has(parentIndexDoc.name)) {
    managedNames.add(parentIndexDoc.name);
  }

  const preservedIndexes = allIndexes.filter(i => !managedNames.has(i.name));

  return {
    found: allIndexes,
    legacyIndexExists: legacyIndex !== null,
    normalizedIdentity: {
      exists: identityExists,
      unique: identityUnique,
      keyCorrect: identityKeyCorrect,
      correct: identityCorrect,
      doc: identityIndexDoc
    },
    parentStatus: {
      exists: parentExists,
      keyCorrect: parentKeyCorrect,
      correct: parentCorrect,
      doc: parentIndexDoc
    },
    preservedIndexes
  };
}

// ─── 2. Plan ─────────────────────────────────────────────────────────────────

/**
 * Decide what index changes to make based on the inspection.
 *
 * Rules:
 *   - legacyName   → remove if present, otherwise skip
 *   - normalizedIdentity → if absent: create; if correct: skip; if wrong: ABORT
 *   - parentStatus  → if absent: create; if correct: skip; if wrong: ABORT
 *
 * Returns { ok, invalidIndexes, indexesToRemove, indexesToCreate, indexesAlreadyCorrect }
 *
 * When ok === false, the migration must abort before any destructive operation.
 */
function buildIndexPlan(inspection) {
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;
  const invalidIndexes = [];
  const indexesToRemove = [];
  const indexesToCreate = [];
  const indexesAlreadyCorrect = [];

  // Legacy name index
  if (inspection.legacyIndexExists) {
    indexesToRemove.push(legacyName.name);
  }

  // Normalized identity index
  if (!inspection.normalizedIdentity.exists) {
    indexesToCreate.push(normalizedIdentity);
  } else if (inspection.normalizedIdentity.correct) {
    indexesAlreadyCorrect.push(normalizedIdentity.name);
  } else {
    // Exists but misconfigured — abort before any change
    const issues = [];
    if (!inspection.normalizedIdentity.unique) issues.push("not unique");
    if (!inspection.normalizedIdentity.keyCorrect) issues.push("wrong key");
    invalidIndexes.push(indexConfigError(
      normalizedIdentity.name,
      `Index is misconfigured (${issues.join(", ")}). Aborting to prevent data loss.`
    ));
  }

  // Parent/status index
  if (!inspection.parentStatus.exists) {
    indexesToCreate.push(parentStatus);
  } else if (inspection.parentStatus.correct) {
    indexesAlreadyCorrect.push(parentStatus.name);
  } else {
    invalidIndexes.push(indexConfigError(
      parentStatus.name,
      `Index is misconfigured (wrong key). Aborting to prevent data loss.`
    ));
  }

  return {
    ok: invalidIndexes.length === 0,
    invalidIndexes,
    indexesToRemove,
    indexesToCreate,
    indexesAlreadyCorrect,
    preservedIndexes: inspection.preservedIndexes
  };
}

// ─── 3. Apply ────────────────────────────────────────────────────────────────

/**
 * Execute exactly the operations in the plan.
 * Only removes _nameLower_1.
 * Only creates indexes that are missing.
 * Never touches preserved indexes.
 *
 * @param {Collection} collection
 * @param {Object} plan — output of buildIndexPlan
 * @returns {Object} result
 */
async function applyIndexPlan(collection, plan) {
  if (!plan.ok) {
    throw new Error(
      "applyIndexPlan called with an invalid plan. Call buildIndexPlan and " +
      "check plan.ok === true before applying."
    );
  }

  const removed = [];
  const created = [];

  for (const indexName of plan.indexesToRemove) {
    await collection.dropIndex(indexName);
    removed.push(indexName);
  }

  for (const indexDef of plan.indexesToCreate) {
    await collection.createIndex(indexDef.key, indexDef.options);
    created.push(indexDef.name);
  }

  return {
    removed,
    created,
    alreadyCorrect: plan.indexesAlreadyCorrect,
    preserved: plan.preservedIndexes.map(i => i.name)
  };
}

// ─── 4. Post-apply verification ───────────────────────────────────────────────

/**
 * Verify that the index transition produced the expected outcome.
 *
 * Checks:
 *   - _nameLower_1 is absent
 *   - _normalizedIdentity_1 exists, has correct key, is unique
 *   - parentStopId_1_status_1 exists, has correct key
 *   - all indexes from preSnapshot that were in preservedIndexes still exist
 *
 * @param {Collection} collection
 * @param {string[]}   preservedNames — names of indexes expected to survive
 * @returns {{ passed: boolean, errors: string[] }}
 */
async function verifyIndexOutcome(collection, preservedNames) {
  const { legacyName, normalizedIdentity, parentStatus } = STOP_REGISTRY_INDEXES;
  const finalIndexes = await collection.indexes();
  const finalMap = new Map(finalIndexes.map(i => [i.name, i]));
  const errors = [];

  // Legacy must be gone
  if (finalMap.has(legacyName.name)) {
    errors.push(`${legacyName.name} still exists after migration.`);
  }

  // Identity must exist, be unique, and have correct key
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

  // Parent/status must exist with correct key
  const parentDoc = finalMap.get(parentStatus.name);
  if (!parentDoc) {
    errors.push(`${parentStatus.name} index is missing.`);
  } else if (!indexKeyMatches(parentDoc, parentStatus.key)) {
    errors.push(`${parentStatus.name} exists but has incorrect key.`);
  }

  // All preserved indexes must still be present
  for (const name of preservedNames) {
    if (!finalMap.has(name)) {
      errors.push(`Unrelated index "${name}" disappeared during migration.`);
    }
  }

  return { passed: errors.length === 0, errors };
}

module.exports = {
  inspectStopIndexes,
  buildIndexPlan,
  applyIndexPlan,
  verifyIndexOutcome
};

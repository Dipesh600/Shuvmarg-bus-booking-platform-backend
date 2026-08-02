"use strict";

const Stop = require("../../../../../models/stopModel");
const { buildStopIdentity } = require("../stop-identity");
const { verifyIndexOutcome } = require("./migration-index.service");

/**
 * Migration Phase 5 — Post-migration verification.
 *
 * Re-reads all stops and confirms:
 *   - every stop has _normalizedIdentity set
 *   - every stop's _normalizedIdentity matches what buildStopIdentity produces
 *   - no duplicate _normalizedIdentity values exist
 *   - every stop has isSearchable and isRouteStop fields
 *   - every stop has a parentStopId field (null is valid)
 *   - indexes are in the expected state (delegates to migration-index.service)
 *
 * @param {string[]} preservedIndexNames — names of unrelated indexes to verify survived
 * @returns {{ passed: boolean, errors: string[] }}
 */
async function verifyStopRegistryMigration(preservedIndexNames = []) {
  const stops = await Stop.find({}).lean();
  const errors = [];
  const identitySet = new Set();

  for (const stop of stops) {
    if (stop.isSearchable === undefined || stop.isRouteStop === undefined) {
      errors.push(`Stop ${stop._id} is missing capability fields (isSearchable / isRouteStop).`);
    }
    if (stop.parentStopId === undefined) {
      errors.push(`Stop ${stop._id} is missing parentStopId field (should be null or an id).`);
    }
    if (!stop._normalizedIdentity) {
      errors.push(`Stop ${stop._id} is missing _normalizedIdentity.`);
    }

    let expectedIdentity = "";
    try {
      expectedIdentity = buildStopIdentity(stop);
    } catch (_) {
      // If identity cannot be built the stop is corrupt; field mismatch will surface below.
    }

    if (stop._normalizedIdentity !== expectedIdentity) {
      errors.push(
        `Stop ${stop._id} identity mismatch: stored "${stop._normalizedIdentity}", ` +
        `expected "${expectedIdentity}".`
      );
    }

    if (identitySet.has(stop._normalizedIdentity)) {
      errors.push(`Duplicate _normalizedIdentity found: "${stop._normalizedIdentity}".`);
    }
    identitySet.add(stop._normalizedIdentity);
  }

  const indexVerification = await verifyIndexOutcome(
    Stop.collection,
    preservedIndexNames
  );

  if (!indexVerification.passed) {
    for (const err of indexVerification.errors) {
      errors.push(err);
    }
  }

  return { passed: errors.length === 0, errors };
}

module.exports = { verifyStopRegistryMigration };

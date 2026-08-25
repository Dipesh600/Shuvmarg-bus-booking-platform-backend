"use strict";

const mongoose = require("mongoose");

const { ENTITY_TYPE_CODES } = require("./entity-type-codes.js");
const { generateEntityCode } = require("./entity-code.js");

/**
 * Allocate an agent's human-facing code (SM-AG-XXXXXXX).
 *
 * entity-code.js guarantees structural validity and nothing else; this is the
 * layer that talks to the database. It works to the same contract as
 * src/modules/admin/platform-registry/variant-code-allocation.service.js:
 * bounded retry, existence check, unique index as the final guard.
 */

/**
 * 100 attempts is generous rather than tight. The body is six random Base32
 * symbols, so the keyspace is 32^6 = 1,073,741,824. Even at a million agents a
 * single draw collides with probability ~0.001, which puts 100 consecutive
 * collisions beyond reach of a working random source.
 *
 * variant-code-allocation needs 10,000 because it walks a sequential counter
 * forward past legacy codes. There is no sequence to walk here.
 */
const MAX_ALLOCATION_ATTEMPTS = 100;

/**
 * The existence check is an optimisation, not the guarantee: two concurrent
 * allocations can both see "free" and both proceed. The unique index on
 * `code` is what actually holds, and a duplicate-key error on save is the
 * caller's signal to retry.
 */
async function allocateAgentCode({
  AgentModel = null,
  generate = generateEntityCode,
} = {}) {
  // Resolved lazily. agentModel.js requires this module to install its hooks, so
  // requiring the model here at load time would close a cycle.
  const model = AgentModel || mongoose.model("Agent");

  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const candidate = generate(ENTITY_TYPE_CODES.AGENT);
    const existing = await model.exists({ code: candidate });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(
    `Could not allocate a unique agent code in ${MAX_ALLOCATION_ATTEMPTS} ` +
    "attempts; either the random source is faulty or the keyspace is exhausted."
  );
}

module.exports = {
  MAX_ALLOCATION_ATTEMPTS,
  allocateAgentCode,
};

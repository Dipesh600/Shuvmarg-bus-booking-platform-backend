"use strict";

const crypto = require("node:crypto");

const { allocateAgentCode } = require("./agent-code-allocation.service.js");

/**
 * Identifier hooks for the Agent schema.
 *
 * Two codes are written for the duration of the transition:
 *   `code`    — SM-AG-XXXXXXX, the scheme we are moving to
 *   `agentId` — SHV-AG-XXX-NNN, the legacy shape ~25 call sites still read
 *
 * Dual write is what lets those readers keep working untouched. They move to
 * `code` in the agent-identity slice, after which the legacy branch below can be
 * deleted along with the field.
 *
 * Both branches only fill a blank. An agent that already carries a code keeps it:
 * codes are published, so re-minting one would strand whoever wrote it down.
 *
 * NOTE: pre('save') does not fire for insertMany or upserts. That was already
 * true of the hook this replaces, and no path creates agents that way today —
 * but a bulk agent import would need to allocate codes itself.
 */

const LEGACY_PREFIX = "SHV-AG";
const LEGACY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LEGACY_RANDOM_LENGTH = 3;

/**
 * The legacy keyspace is 36^3 * 1000 = 46,656,000 — small enough that collisions
 * are a real event rather than a theoretical one, which is presumably why the
 * loop this replaces had no cap at all. Unbounded is the wrong answer: it issues
 * a query per attempt, so an exhausted keyspace becomes a self-inflicted outage
 * instead of a failed request. Fail the one request loudly.
 */
const MAX_LEGACY_ATTEMPTS = 100;

function buildLegacyAgentId() {
  let random = "";
  for (let index = 0; index < LEGACY_RANDOM_LENGTH; index += 1) {
    // crypto.randomInt is unbiased and unpredictable; Math.random, which the
    // previous generator used, is neither — and this identifier is published.
    random += LEGACY_ALPHABET[crypto.randomInt(LEGACY_ALPHABET.length)];
  }
  const suffix = String(crypto.randomInt(1000)).padStart(3, "0");
  return `${LEGACY_PREFIX}-${random}-${suffix}`;
}

async function allocateLegacyAgentId(AgentModel) {
  for (let attempt = 0; attempt < MAX_LEGACY_ATTEMPTS; attempt += 1) {
    const candidate = buildLegacyAgentId();
    const existing = await AgentModel.exists({ agentId: candidate });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(
    `Could not allocate a unique legacy agentId in ${MAX_LEGACY_ATTEMPTS} attempts; ` +
    "the SHV-AG keyspace is effectively exhausted."
  );
}

/**
 * Install the identifier hooks on a schema. Allocators are injectable so the
 * behaviour can be tested without a database.
 */
function applyAgentCodeHooks(schema, {
  allocate = allocateAgentCode,
  allocateLegacy = allocateLegacyAgentId,
} = {}) {
  schema.pre("save", async function assignAgentIdentifiers() {
    const AgentModel = this.constructor;

    if (!this.code) {
      this.code = await allocate({ AgentModel });
    }
    if (!this.agentId) {
      this.agentId = await allocateLegacy(AgentModel);
    }
  });
}

module.exports = {
  LEGACY_PREFIX,
  MAX_LEGACY_ATTEMPTS,
  allocateLegacyAgentId,
  applyAgentCodeHooks,
  buildLegacyAgentId,
};

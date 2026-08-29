"use strict";

const { ENTITY_TYPE_CODES } = require("./entity-type-codes.js");
const { parseEntityCode } = require("./entity-code.js");

/**
 * Dual read for agent codes.
 *
 * Agents issued before the SM-AG scheme carry only `agentId`; agents issued after
 * carry both. Every lookup must accept either form, because a code an agent gave
 * an operator months ago is still the code that operator will type today.
 *
 * Readers move to `code` in the agent-identity slice. Until the legacy field is
 * backfilled and dropped, route all "find agent by code" paths through here
 * rather than reinventing the fallback per call site.
 */

/** The legacy shape minted before SM-AG: SHV-AG-XXX-NNN. */
const LEGACY_AGENT_ID_PATTERN = /^SHV-AG-[A-Z0-9]{3}-[0-9]{3}$/;

/**
 * Build a Mongo filter that finds an agent by either code form.
 *
 * Deliberately a single-field equality rather than an $or: a valid SM-AG code can
 * never match the legacy shape and vice versa, so one branch or the other applies
 * and the query stays served by a single index.
 *
 * Returns null when the input can be neither form. Callers should treat that as
 * "no such agent" and skip the database entirely — it is the cheapest place to
 * reject a typo, and it keeps unindexed junk out of the query planner.
 */
function agentCodeFilter(input) {
  if (typeof input !== "string") {
    return null;
  }

  const parsed = parseEntityCode(input);
  if (parsed.valid && parsed.typeCode === ENTITY_TYPE_CODES.AGENT) {
    return { code: parsed.canonical };
  }

  // Legacy IDs are matched exactly, never normalised. The forgiving reading in
  // entity-code.js is safe because we chose that alphabet; SHV-AG bodies can
  // contain I, L, O and U, so folding them could resolve to a different agent.
  const trimmed = input.trim();
  if (LEGACY_AGENT_ID_PATTERN.test(trimmed)) {
    return { agentId: trimmed };
  }

  return null;
}

/**
 * The code to show a human, or put in a payload: the new scheme when the agent
 * has one, the legacy id until it is backfilled.
 */
function displayAgentCode(agent) {
  if (!agent) {
    return null;
  }
  return agent.code || agent.agentId || null;
}

module.exports = {
  LEGACY_AGENT_ID_PATTERN,
  agentCodeFilter,
  displayAgentCode,
};

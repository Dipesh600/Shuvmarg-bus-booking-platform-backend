"use strict";

const { agentCodeFilter } = require("./agent-code-lookup.js");
const { AGENT_SCOPES, scopeOf } = require("./agent-enums.js");
const {
  deriveOperatorKycStatus,
  isAgentVerificationCleared,
} = require("./agent-verification.js");

/**
 * The questions an operator asks about an agent they are about to hire: is this
 * a code at all, is this agent theirs to hire, and how far through verification
 * are they really?
 *
 * These live here rather than in the lookup endpoint that first needed them
 * because the assign endpoint asks the identical questions of the identical
 * input. Two copies of "may an operator assign this agent?" is one copy that
 * gets updated and one that quietly does not.
 */

/**
 * Longest input worth parsing. A canonical agent code is 13 characters and the
 * legacy form is 13; the allowance is for separators and stray whitespace a
 * human might paste. Anything longer is not a typo, and there is no reason to
 * hand it to the parser.
 */
const MAX_CODE_INPUT_LENGTH = 32;

/**
 * The only Agent fields an operator-facing read may load.
 *
 * A projection, not a full document, because the Agent schema also holds
 * citizenship and PAN numbers, bank details and admin notes. Selecting the whole
 * document and trimming it in a mapper would put all of that one careless spread
 * away from an operator's browser.
 *
 * `agentType` and `operationType` are here despite being deprecated:
 * `isAssignableByOperator` reads through `scopeOf`, which falls back to them for
 * rows written before the new fields existed. Omit `agentType` and every legacy
 * OPERATOR_LINKED agent reads as PLATFORM and gets refused as unassignable.
 * `district` and `municipality` are needed twice over — shown to the operator,
 * and read by `hasRequiredOutletDetails` when the status is derived.
 *
 * Shared by lookup, assign and the operator assignment list, which must classify
 * an agent identically. A projection that drifts between them is a difference in
 * who counts as assignable and a chance for the list to load private KYC fields.
 */
const AGENT_PREVIEW_FIELDS = [
  "code",
  "agentId",
  "scope",
  "agentType",
  "applicationStatus",
  "outletType",
  "operationType",
  "businessName",
  "district",
  "municipality",
].join(" ");

/**
 * The Mongo filter for a typed code, or null when the input can be no code at
 * all — in which case the caller must not touch the database. Both code forms
 * are accepted, because a code an agent handed out months ago is still the code
 * the operator will type today.
 */
const agentFilterFromInput = (rawCode) => {
  if (typeof rawCode !== "string" || rawCode.length > MAX_CODE_INPUT_LENGTH) {
    return null;
  }
  return agentCodeFilter(rawCode);
};

/**
 * May an operator assign this agent at all?
 *
 * OPERATOR scope only (master plan D7). Read through `scopeOf` rather than off
 * `agent.scope`, so a row written before the scope field existed is classified
 * by its legacy `agentType` instead of defaulting — which is also why every
 * projection feeding this function has to include `agentType`.
 */
const isAssignableByOperator = (agent) => scopeOf(agent) === AGENT_SCOPES.OPERATOR;

/**
 * The KYC status this agent has actually earned.
 *
 * Derived here rather than read off the stored field, because the stored value
 * lags: an agent created by an owner sits at DRAFT until something recomputes
 * it, and an operator looking them up minutes after they verified their phone
 * would otherwise be shown a stale DRAFT and conclude the agent had not done
 * their part.
 *
 * `deriveOperatorKycStatus` returns null when it has no business deciding —
 * platform scope, a terminal status like SUSPENDED, or a `phoneVerified` it was
 * not given — and the stored value stands in that case.
 */
const effectiveKycStatus = (agent) => deriveOperatorKycStatus(agent, {
  phoneVerified: agent?.user?.phoneVerified,
}) || agent?.applicationStatus || null;

/**
 * The verified badge, answered against the derived status rather than the stored
 * one so the badge and the status shown beside it cannot disagree.
 */
const hasVerifiedBadge = (agent, kycStatus) => isAgentVerificationCleared({
  ...agent,
  applicationStatus: kycStatus,
});

module.exports = {
  AGENT_PREVIEW_FIELDS,
  MAX_CODE_INPUT_LENGTH,
  agentFilterFromInput,
  effectiveKycStatus,
  hasVerifiedBadge,
  isAssignableByOperator,
};

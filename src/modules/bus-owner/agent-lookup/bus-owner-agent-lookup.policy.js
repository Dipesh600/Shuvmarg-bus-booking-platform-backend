'use strict';

const { agentCodeFilter } = require('../../../shared/identity/agent-code-lookup');
const { AGENT_SCOPES, scopeOf } = require('../../../shared/identity/agent-enums');
const {
  deriveOperatorKycStatus,
  isAgentVerificationCleared,
} = require('../../../shared/identity/agent-verification');

/**
 * Longest input worth parsing. A canonical agent code is 13 characters and the
 * legacy form is 13; the allowance is for separators and stray whitespace a
 * human might paste. Anything longer is not a typo, and there is no reason to
 * hand it to the parser.
 */
const MAX_CODE_INPUT_LENGTH = 32;

/**
 * The Mongo filter for a typed code, or null when the input can be no code at
 * all — in which case the caller must not touch the database. Both code forms
 * are accepted, because a code an agent handed out months ago is still the code
 * the operator will type today.
 */
const lookupFilterFor = (rawCode) => {
  if (typeof rawCode !== 'string' || rawCode.length > MAX_CODE_INPUT_LENGTH) return null;
  return agentCodeFilter(rawCode);
};

/**
 * May an operator assign this agent at all?
 *
 * OPERATOR scope only (master plan D7). Read through `scopeOf` rather than off
 * `agent.scope`, so a row written before the scope field existed is classified
 * by its legacy `agentType` instead of defaulting — which is also why the
 * repository projection has to include `agentType`.
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
  MAX_CODE_INPUT_LENGTH,
  effectiveKycStatus,
  hasVerifiedBadge,
  isAssignableByOperator,
  lookupFilterFor,
};

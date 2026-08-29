'use strict';

const policy = require('../../../shared/identity/agent-assignability');
const errors = require('../../../shared/identity/agent-code-errors');
const mapper = require('./bus-owner-agent-lookup.mapper');
const repository = require('./bus-owner-agent-lookup.repository');

/**
 * Look up an agent by the code they published, so an operator can check they
 * have the right person before inviting them.
 *
 * Read-only and side-effect free. It creates nothing: the invite is a separate,
 * explicit action, and a lookup that quietly created an assignment would make
 * "let me check this code" indistinguishable from hiring someone.
 */
const lookupAgentByCode = async (rawCode) => {
  const filter = policy.agentFilterFromInput(rawCode);
  // Malformed input never reaches the database. It cannot match, and the query
  // planner has no index for junk.
  if (!filter) throw errors.agentNotFoundError();

  const agent = await repository.findAgentByCodeFilter(filter);
  if (!agent) throw errors.agentNotFoundError();

  if (!policy.isAssignableByOperator(agent)) throw errors.agentNotAssignableError();

  const kycStatus = policy.effectiveKycStatus(agent);

  return {
    statusCode: 200,
    responseBody: mapper.toPreviewResponse({
      agent,
      kycStatus,
      isVerified: policy.hasVerifiedBadge(agent, kycStatus),
    }),
  };
};

module.exports = {
  lookupAgentByCode,
};

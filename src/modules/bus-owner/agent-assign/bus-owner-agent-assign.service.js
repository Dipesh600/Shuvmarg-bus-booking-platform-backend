'use strict';

const policy = require('../../../shared/identity/agent-assignability');
const codeErrors = require('../../../shared/identity/agent-code-errors');
const errors = require('./bus-owner-agent-assign.errors');
const mapper = require('./bus-owner-agent-assign.mapper');
const assignPolicy = require('./bus-owner-agent-assign.policy');
const repository = require('./bus-owner-agent-assign.repository');

/**
 * Invite an agent to sell one of the operator's brands.
 *
 * The order of the checks is the security argument. Brand ownership is proved
 * before the agent is looked up, so a caller who does not own the brand learns
 * nothing about whether a code exists — the 403 arrives whether or not it does.
 * Malformed codes are refused without a query at all.
 *
 * Deliberately NOT gated on the agent's KYC status. An invite is not a selling
 * right, and requiring verification first would deadlock onboarding: the operator
 * invites, and the agent completes KYC afterwards. The verification gate belongs
 * on the sale, where it can be enforced against the status at that moment rather
 * than against a status that was true on the day the invite was sent. The
 * response carries `kycStatus` and `isVerified` so the operator can see where the
 * agent actually stands.
 */
const assignAgent = async (ownerId, body) => {
  const input = assignPolicy.validateAssignInput(body);
  if (input.errors.length > 0) throw errors.invalidInputError(input.errors);

  const brand = await repository.findOwnedBrand(ownerId, input.brandId);
  if (!brand) throw errors.brandNotOwnedError();

  const filter = policy.agentFilterFromInput(input.agentCode);
  if (!filter) throw codeErrors.agentNotFoundError();

  const agent = await repository.findAgentByCodeFilter(filter);
  if (!agent) throw codeErrors.agentNotFoundError();

  // Platform agents sell for us, not for an operator. Refused here as well as at
  // lookup, because an operator can post a code straight to this endpoint without
  // ever calling the preview.
  if (!policy.isAssignableByOperator(agent)) throw codeErrors.agentNotAssignableError();

  const now = new Date();
  let assignment;
  try {
    assignment = await repository.createAssignment(assignPolicy.newAssignment({
      agentId: agent._id,
      brandId: input.brandId,
      ownerId,
      input,
      now,
    }));
  } catch (error) {
    // A schema validator that the request layer did not already cover — the
    // commission validator reads a sibling field, so it can only run here. Still
    // the caller's bad input, so it answers 400 rather than 500.
    if (error.name === 'ValidationError') {
      throw errors.invalidInputError(Object.values(error.errors || {}).map((e) => e.message));
    }
    // The partial unique index, not a prior read, is what rules out a second live
    // assignment for this pair. The status is read afterwards purely to say which
    // kind of duplicate it was.
    if (error.code !== 11000) throw error;
    const status = await repository.findLiveAssignmentStatus(agent._id, input.brandId);
    throw errors.assignmentExistsError(status);
  }

  const kycStatus = policy.effectiveKycStatus(agent);

  return {
    statusCode: 201,
    responseBody: mapper.toCreatedResponse({
      assignment,
      agent,
      brand,
      kycStatus,
      isVerified: policy.hasVerifiedBadge(agent, kycStatus),
    }),
  };
};

module.exports = {
  assignAgent,
};

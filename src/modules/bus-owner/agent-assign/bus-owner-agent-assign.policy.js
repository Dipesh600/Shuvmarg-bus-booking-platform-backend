'use strict';

const {
  ASSIGNMENT_STATUSES,
  inviteExpiryFrom,
} = require('../../../shared/identity/agent-assignment-status');
const { isObjectId } = require('./bus-owner-agent-assign.parse');
const terms = require('./bus-owner-agent-assign.terms');

/**
 * What an operator may supply when assigning an agent.
 *
 * `agentCode` and `brandId`, plus optional terms. Note what is NOT accepted:
 * `status` (a fresh assignment is INVITED and nothing else), `ownerId` (it comes
 * from the token), `agentId` (the code is the handle — an operator who could pass
 * a raw agent _id could assign an agent whose code they never held), and any
 * timestamp.
 */
const validateAssignInput = (body) => {
  const source = body && typeof body === 'object' ? body : {};
  const errors = [];

  const agentCode = typeof source.agentCode === 'string' ? source.agentCode.trim() : '';
  const brandId = typeof source.brandId === 'string' ? source.brandId.trim() : '';

  if (!agentCode) errors.push('agentCode is required.');
  // Required, unlike the invite endpoint: an assignment names the inventory it
  // opens up, and an assignment with no brand opens up nothing while looking like
  // it opened up everything.
  if (!brandId) errors.push('brandId is required.');
  else if (!isObjectId(brandId)) errors.push('brandId is not a valid id.');

  const access = terms.parseAccess(source, errors);
  const permissions = terms.parsePermissions(source.permissions, errors);
  const commission = terms.parseCommission(source.commission, errors);

  return {
    agentCode, brandId, access, permissions, commission, errors,
  };
};

/**
 * The row an operator's invite creates.
 *
 * INVITED, always (master plan D3). Not ACTIVE even when the owner created this
 * agent themselves: the agent's own account is what accepts, and an operator who
 * could mint an already-ACTIVE assignment could put someone to work selling
 * without their ever having agreed to it.
 *
 * `ownerId` is denormalised from the caller's token rather than read off the
 * brand, so a brand whose ownerId is somehow stale cannot hand an assignment to
 * the wrong owner. The brand ownership check has already proved the two agree.
 */
const newAssignment = ({ agentId, brandId, ownerId, input, now }) => ({
  agentId,
  operatorId: brandId,
  ownerId,
  status: ASSIGNMENT_STATUSES.INVITED,
  invitedBy: ownerId,
  invitedAt: now,
  expiresAt: inviteExpiryFrom(now),
  accessScope: input.access.accessScope,
  allowedRouteIds: input.access.allowedRouteIds,
  allowedScheduleIds: input.access.allowedScheduleIds,
  // Omitted when empty so the schema defaults apply rather than an empty
  // subdocument overwriting them.
  ...(Object.keys(input.permissions).length > 0 ? { permissions: input.permissions } : {}),
  ...(input.commission ? { operatorCommission: input.commission } : {}),
});

const staleInviteFilter = ({ agentId, brandId, now }) => ({
  agentId,
  operatorId: brandId,
  status: ASSIGNMENT_STATUSES.INVITED,
  expiresAt: { $lte: now },
});

module.exports = {
  newAssignment,
  staleInviteFilter,
  validateAssignInput,
};

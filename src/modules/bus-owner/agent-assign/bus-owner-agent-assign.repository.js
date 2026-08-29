'use strict';

const { AGENT_PREVIEW_FIELDS } = require('../../../shared/identity/agent-assignability');
const {
  ASSIGNMENT_STATUSES,
  LIVE_ASSIGNMENT_STATUSES,
} = require('../../../shared/identity/agent-assignment-status');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const Agent = require('../../../../models/agentModel');
const OperatorBrand = require('../../../../models/operatorBrandModel');

/**
 * Ownership proof. The brand must match BOTH the id supplied and the calling
 * owner, in one query. Two queries — fetch then compare — is how an ownership
 * check ends up accidentally optional.
 *
 * `brandName` is the schema's field; there is no `name` on OperatorBrand.
 */
const findOwnedBrand = (ownerId, brandId) => OperatorBrand
  .findOne({ _id: brandId, ownerId })
  .select('brandName')
  .lean();

/**
 * The agent behind a typed code, under the same projection the lookup preview
 * uses. Shared deliberately: the operator saw a preview and then assigned from
 * it, so the two reads have to classify the agent identically. A narrower
 * projection here would let an agent pass the preview and fail the assign.
 */
const findAgentByCodeFilter = (filter) => Agent
  .findOne(filter)
  .select(AGENT_PREVIEW_FIELDS)
  .populate({ path: 'user', select: 'name phoneVerified' })
  .lean();

/**
 * Created with `new` + save() so schema defaults and validators run — the
 * commission validator in particular reads `this.mode`, which an update
 * pipeline would not give it.
 */
const createAssignment = (data) => new AgentAssignment(data).save();

/** Free the live-index slot once an unanswered invitation has timed out. */
const expireStaleInvites = (filter) => AgentAssignment.updateMany(
  filter,
  { $set: { status: ASSIGNMENT_STATUSES.EXPIRED } },
  { runValidators: true },
);

/**
 * The live row that blocked an insert. Read only after a duplicate-key error, to
 * tell the operator whether the agent is already invited, already working, or
 * suspended. Not read beforehand: the index is what settles the race, and a
 * check-then-insert would be a slower route to the same 409 with a window in
 * the middle.
 */
const findLiveAssignmentStatus = async (agentId, operatorId) => {
  const existing = await AgentAssignment
    .findOne({ agentId, operatorId, status: { $in: [...LIVE_ASSIGNMENT_STATUSES] } })
    .select('status')
    .lean();
  return existing?.status || null;
};

module.exports = {
  createAssignment,
  expireStaleInvites,
  findAgentByCodeFilter,
  findLiveAssignmentStatus,
  findOwnedBrand,
};

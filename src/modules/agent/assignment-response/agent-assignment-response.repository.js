'use strict';

const Agent = require('../../../../models/agentModel');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const { ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');

const findAgentIdForUser = (userId) => Agent
  .findOne({ user: userId })
  .select('_id')
  .lean();

/** The filter contains ownership and the entire transition precondition. */
const transitionInvite = (filter, update) => AgentAssignment
  .findOneAndUpdate(filter, { $set: update }, {
    new: true,
    runValidators: true,
    context: 'query',
  })
  .populate({ path: 'operatorId', select: 'brandName' })
  .lean();

/** Diagnostic read after an atomic miss; ownership remains in the query. */
const findAssignmentState = (assignmentId, agentId) => AgentAssignment
  .findOne({ _id: assignmentId, agentId })
  .select('status expiresAt')
  .lean();

/** Close the stale INVITED row so the partial live index permits re-inviting. */
const expireStaleInvite = (filter) => AgentAssignment.findOneAndUpdate(
  filter,
  { $set: { status: ASSIGNMENT_STATUSES.EXPIRED } },
  { new: true, runValidators: true, context: 'query' },
).lean();

module.exports = {
  expireStaleInvite,
  findAgentIdForUser,
  findAssignmentState,
  transitionInvite,
};

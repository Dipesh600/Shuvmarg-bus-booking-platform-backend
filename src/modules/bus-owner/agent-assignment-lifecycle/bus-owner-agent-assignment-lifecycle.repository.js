'use strict';

const { AGENT_PREVIEW_FIELDS } = require('../../../shared/identity/agent-assignability');
const AgentAssignment = require('../../../../models/agentAssignmentModel');

const withPublicRelations = (query) => query
  .populate({ path: 'operatorId', select: 'brandName' })
  .populate({
    path: 'agentId',
    select: AGENT_PREVIEW_FIELDS,
    populate: { path: 'user', select: 'name phoneVerified' },
  })
  .lean();

const listAssignments = async (filter, { page, limit }) => {
  const rowsQuery = AgentAssignment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const [rows, total] = await Promise.all([
    withPublicRelations(rowsQuery),
    AgentAssignment.countDocuments(filter),
  ]);
  return { rows, total };
};

/** Ownership and the actor-specific starting state are in this atomic filter. */
const transitionAssignment = (filter, update) => withPublicRelations(
  AgentAssignment.findOneAndUpdate(filter, { $set: update }, {
    new: true,
    runValidators: true,
    context: 'query',
  }),
);

/** Diagnose only after an atomic miss, still scoped to the token owner. */
const findAssignmentState = (assignmentId, ownerId) => AgentAssignment
  .findOne({ _id: assignmentId, ownerId })
  .select('status')
  .lean();

module.exports = {
  findAssignmentState,
  listAssignments,
  transitionAssignment,
};

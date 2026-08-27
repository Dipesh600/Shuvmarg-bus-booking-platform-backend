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

const buildListRowsQuery = (filter, { page, limit }) => withPublicRelations(
  AgentAssignment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit),
);

const listAssignments = async (filter, pagination) => {
  const rowsQuery = buildListRowsQuery(filter, pagination);
  const [rows, total] = await Promise.all([
    rowsQuery,
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
  buildListRowsQuery,
  findAssignmentState,
  listAssignments,
  transitionAssignment,
};

'use strict';

const errors = require('./agent-assignment-response.errors');
const mapper = require('./agent-assignment-response.mapper');
const parse = require('./agent-assignment-response.parse');
const policy = require('./agent-assignment-response.policy');
const repository = require('./agent-assignment-response.repository');

const mapWriteError = (error) => {
  if (error.name === 'ValidationError') {
    throw errors.invalidInputError(Object.values(error.errors || {}).map((item) => item.message));
  }
  if (error.code === 11000) throw errors.assignmentConflictError();
  throw error;
};

const diagnoseMiss = async ({ assignmentId, agentId, now }) => {
  const assignment = await repository.findAssignmentState(assignmentId, agentId);
  if (!assignment) throw errors.assignmentNotFoundError();

  if (policy.isExpiredInvite(assignment, now)) {
    await repository.expireStaleInvite(policy.staleInviteFilter({ assignmentId, agentId, now }));
    throw errors.inviteExpiredError();
  }

  throw errors.assignmentStateError(assignment.status);
};

const respond = async ({ userId, assignmentId, action, reason }) => {
  // Reject malformed ids before resolving the agent or touching assignments.
  if (!parse.isObjectId(assignmentId)) throw errors.assignmentNotFoundError();

  const agent = await repository.findAgentIdForUser(userId);
  if (!agent) throw errors.noApplicationError();

  const now = new Date();
  const filter = policy.liveInviteFilter({ assignmentId, agentId: agent._id, now });
  // Do not pre-read for an existing ACTIVE row: the model's partial unique
  // index is the concurrency-safe authority and a duplicate maps to 409.
  const update = action === 'accept'
    ? policy.acceptUpdate(now)
    : policy.declineUpdate(now, reason);

  let assignment;
  try {
    assignment = await repository.transitionInvite(filter, update);
  } catch (error) {
    mapWriteError(error);
  }

  if (!assignment) await diagnoseMiss({ assignmentId, agentId: agent._id, now });
  return { statusCode: 200, responseBody: mapper.toResponse(assignment, action) };
};

const acceptAssignment = (userId, assignmentId) => respond({
  userId, assignmentId, action: 'accept', reason: null,
});

const declineAssignment = async (userId, assignmentId, body) => {
  // Preserve the endpoint's non-enumerating malformed-id contract even when
  // the accompanying body is also invalid: no repository call may win first.
  if (!parse.isObjectId(assignmentId)) throw errors.assignmentNotFoundError();
  const input = parse.parseDeclineReason(body);
  if (input.errors.length > 0) throw errors.invalidInputError(input.errors);
  return respond({ userId, assignmentId, action: 'decline', reason: input.reason });
};

const listAssignments = async (userId, query) => {
  const parsed = parse.parseListQuery(query);
  if (parsed.errors.length) throw errors.invalidInputError(parsed.errors);
  const agent = await repository.findAgentIdForUser(userId);
  if (!agent) throw errors.noApplicationError();
  const [rows, total] = await Promise.all([
    repository.listAssignments(agent._id, parsed.value),
    repository.countAssignments(agent._id),
  ]);
  return {
    statusCode: 200,
    responseBody: mapper.toListResponse({
      rows, total, ...parsed.value, now: new Date(),
    }),
  };
};

module.exports = {
  acceptAssignment,
  declineAssignment,
  listAssignments,
};

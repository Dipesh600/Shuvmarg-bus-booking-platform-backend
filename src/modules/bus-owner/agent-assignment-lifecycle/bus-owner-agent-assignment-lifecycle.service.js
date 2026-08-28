'use strict';

const errors = require('./bus-owner-agent-assignment-lifecycle.errors');
const mapper = require('./bus-owner-agent-assignment-lifecycle.mapper');
const parse = require('./bus-owner-agent-assignment-lifecycle.parse');
const policy = require('./bus-owner-agent-assignment-lifecycle.policy');
const repository = require('./bus-owner-agent-assignment-lifecycle.repository');

const mapWriteError = (error) => {
  if (error.name === 'ValidationError') {
    throw errors.invalidInputError(Object.values(error.errors || {}).map((item) => item.message));
  }
  if (error.code === 11000) throw errors.assignmentConflictError();
  throw error;
};

const listAssignments = async (ownerId, query) => {
  const input = parse.parseListQuery(query);
  if (input.errors.length > 0) throw errors.invalidInputError(input.errors);
  const now = new Date();
  const filter = policy.listFilter({ ownerId, ...input.value, now });
  const result = await repository.listAssignments(filter, input.value);
  return {
    statusCode: 200,
    responseBody: mapper.toListResponse({ ...result, ...input.value, now }),
  };
};

const diagnoseMiss = async ({ assignmentId, ownerId }) => {
  const assignment = await repository.findAssignmentState(assignmentId, ownerId);
  if (!assignment) throw errors.assignmentNotFoundError();
  throw errors.assignmentStateError(assignment.status);
};

const transition = async ({ ownerId, assignmentId, action, body }) => {
  if (!parse.isObjectId(assignmentId)) throw errors.assignmentNotFoundError();

  let note = null;
  if (action !== 'reinstate') {
    const input = parse.parseOperatorNote(body);
    if (input.errors.length > 0) throw errors.invalidInputError(input.errors);
    note = input.note;
  }

  const now = new Date();
  const filter = policy.transitionFilter({ ownerId, assignmentId, action });
  const update = policy.transitionUpdate({ action, ownerId, note, now });
  let assignment;
  try {
    assignment = await repository.transitionAssignment(filter, update);
  } catch (error) {
    mapWriteError(error);
  }
  if (!assignment) await diagnoseMiss({ assignmentId, ownerId });
  return { statusCode: 200, responseBody: mapper.toTransitionResponse(assignment, action) };
};

const suspendAssignment = (ownerId, assignmentId, body) => transition({
  ownerId, assignmentId, action: 'suspend', body,
});
const reinstateAssignment = (ownerId, assignmentId) => transition({
  ownerId, assignmentId, action: 'reinstate', body: null,
});
const revokeAssignment = (ownerId, assignmentId, body) => transition({
  ownerId, assignmentId, action: 'revoke', body,
});

module.exports = {
  listAssignments,
  reinstateAssignment,
  revokeAssignment,
  suspendAssignment,
};

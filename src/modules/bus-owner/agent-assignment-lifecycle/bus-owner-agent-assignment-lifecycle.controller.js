'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./bus-owner-agent-assignment-lifecycle.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

const run = (action) => asyncHandler(async (req, res) => {
  const ownerId = req.userInfo?.id;
  if (!ownerId) return respond(res, 401, unauthorized);
  try {
    const result = action === 'list'
      ? await service.listAssignments(ownerId, req.query)
      : await service[`${action}Assignment`](ownerId, req.params.assignmentId, req.body);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    throw error;
  }
});

module.exports = {
  listAssignments: run('list'),
  reinstateAssignment: run('reinstate'),
  revokeAssignment: run('revoke'),
  suspendAssignment: run('suspend'),
};

'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./agent-assignment-response.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

const run = (action) => asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  if (!userId) return respond(res, 401, unauthorized);

  try {
    const result = action === 'accept'
      ? await service.acceptAssignment(userId, req.params.assignmentId)
      : await service.declineAssignment(userId, req.params.assignmentId, req.body);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    throw error;
  }
});

const listAssignments = asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  if (!userId) return respond(res, 401, unauthorized);
  try {
    const result = await service.listAssignments(userId, req.query);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    throw error;
  }
});

module.exports = {
  acceptAssignment: run('accept'),
  declineAssignment: run('decline'),
  listAssignments,
};

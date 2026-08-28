'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./agent-assignment-options.service');

const listOptions = asyncHandler(async (req, res) => {
  const ownerId = req.userInfo?.id;
  if (!ownerId) return respond(res, 401, { success: false, message: 'Unauthorized.' });
  try {
    const result = await service.listOptions(ownerId, req.query);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    throw error;
  }
});

module.exports = { listOptions };

'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./bus-owner-agent-invite.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

/**
 * POST /api/bus-owner/agents
 *
 * The owner id comes from the verified token, never from the body. An owner
 * cannot create an agent "on behalf of" another owner.
 */
const createAgent = asyncHandler(async (req, res) => {
  const ownerId = req.userInfo?.id;
  if (!ownerId) return respond(res, 401, unauthorized);

  try {
    const result = await service.createAgent(ownerId, req.body);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[BusOwner createAgent] Error:', error.message);
    return respond(res, 500, { success: false, message: 'Internal Server Error' });
  }
});

module.exports = {
  createAgent,
};

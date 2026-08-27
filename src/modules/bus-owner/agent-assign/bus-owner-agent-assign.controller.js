'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./bus-owner-agent-assign.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

/**
 * POST /api/bus-owner/agents/assignments
 *
 * The owner id comes from the token and nowhere else. It is both the ownership
 * subject for the brand check and the `ownerId` written on the row, so a body
 * field of the same name would be an invitation to assign agents on another
 * operator's behalf.
 */
const assignAgent = asyncHandler(async (req, res) => {
  const ownerId = req.userInfo?.id;
  if (!ownerId) return respond(res, 401, unauthorized);

  try {
    const result = await service.assignAgent(ownerId, req.body);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[BusOwner assignAgent] Error:', error.message);
    return respond(res, 500, { success: false, message: 'Internal Server Error' });
  }
});

module.exports = {
  assignAgent,
};

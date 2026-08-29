'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./bus-owner-agent-lookup.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

/**
 * GET /api/bus-owner/agents/lookup/:code
 *
 * The owner id is required even though it is not used in the query: the preview
 * is only for signed-in operators, and requiring the token is what keeps a
 * published agent code from being a public read for anyone on the internet.
 * Rate limiting is keyed on that same id.
 */
const lookupAgent = asyncHandler(async (req, res) => {
  const ownerId = req.userInfo?.id;
  if (!ownerId) return respond(res, 401, unauthorized);

  try {
    const result = await service.lookupAgentByCode(req.params.code);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error('[BusOwner lookupAgent] Error:', error.message);
    return respond(res, 500, { success: false, message: 'Internal Server Error' });
  }
});

module.exports = {
  lookupAgent,
};

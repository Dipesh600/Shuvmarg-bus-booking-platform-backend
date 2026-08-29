'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./agent-identity.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

const handle = (label, run) => asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  if (!userId) return respond(res, 401, unauthorized);
  try {
    const result = await run(userId, req);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    console.error(`[${label}] Error:`, error.message);
    return respond(res, 500, { success: false, message: 'Internal Server Error' });
  }
});

const getIdentity = handle('Agent getIdentity', (userId) => service.getIdentity(userId));

const getCode = handle('Agent getCode', (userId) => service.getCode(userId));

const updateIdentity = handle(
  'Agent updateIdentity',
  (userId, req) => service.updateIdentity(userId, req.body),
);

module.exports = {
  getCode,
  getIdentity,
  updateIdentity,
};

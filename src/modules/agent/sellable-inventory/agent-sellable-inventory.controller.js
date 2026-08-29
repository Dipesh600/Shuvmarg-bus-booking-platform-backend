'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./agent-sellable-inventory.service');

const unauthorized = { success: false, message: 'Unauthorized.' };

const listSellableInventory = asyncHandler(async (req, res) => {
  const userId = req.userInfo?.id;
  if (!userId) return respond(res, 401, unauthorized);
  try {
    const result = await service.listSellableInventory(userId, req.query);
    return respond(res, result.statusCode, result.responseBody);
  } catch (error) {
    if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
    throw error;
  }
});

module.exports = { listSellableInventory };

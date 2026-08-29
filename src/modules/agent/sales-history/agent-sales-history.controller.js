'use strict';

const AppError = require('../../../shared/errors/app-error');
const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');

const unauthorized = { success: false, message: 'Unauthorized.' };

const createController = (service) => {
  const call = (method) => asyncHandler(async (req, res) => {
    const userId = req.userInfo?.id;
    if (!userId) return respond(res, 401, unauthorized);
    try {
      const result = await service[method](userId, req.query);
      return respond(res, result.statusCode, result.responseBody);
    } catch (error) {
      if (error instanceof AppError) return respond(res, error.statusCode, error.responseBody);
      throw error;
    }
  });
  return { listCustomers: call('listCustomers'), listSales: call('listSales') };
};

module.exports = { createController };

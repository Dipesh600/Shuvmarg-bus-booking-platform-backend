'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const logger = require('../../../../utils/logger');
const service = require('./agent-dashboard.service');

const getDashboard = asyncHandler(async (req, res) => {
  try {
    const result = await service.getDashboard({
      userId: req.userInfo?.id,
    });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    logger.error('agent: getDashboard error', { error: error.message });
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

module.exports = {
  getDashboard,
};

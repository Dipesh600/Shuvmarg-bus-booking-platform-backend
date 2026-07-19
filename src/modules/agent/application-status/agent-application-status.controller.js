'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const logger = require('../../../../utils/logger');
const service = require('./agent-application-status.service');

const getApplicationStatus = asyncHandler(async (req, res) => {
  try {
    const result = await service.getApplicationStatus({
      userId: req.userInfo?.id,
      userName: req.userInfo?.name,
    });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    logger.error('agent: getApplicationStatus error', {
      error: error.message,
    });
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

module.exports = {
  getApplicationStatus,
};

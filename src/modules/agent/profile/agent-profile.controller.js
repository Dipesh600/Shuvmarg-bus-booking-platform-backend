'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const logger = require('../../../../utils/logger');
const service = require('./agent-profile.service');

const getProfile = asyncHandler(async (req, res) => {
  try {
    const result = await service.getProfile({
      userId: req.userInfo?.id,
    });
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    logger.error('agent: getProfile error', { error: error.message });
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error',
    });
  }
});

module.exports = {
  getProfile,
};

'use strict';

const asyncHandler = require('../../../shared/http/async-handler');
const respond = require('../../../shared/http/respond');
const service = require('./agent-kyc-review.service');

const updateAgentKyc = asyncHandler(async (req, res) => {
  try {
    const result = await service.reviewAgentKyc(req.body, req.adminInfo?.id || null);
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('updateAgentKyc error:', error);
    return respond(res, 500, {
      success: false,
      message: 'Internal Server Error!',
    });
  }
});

module.exports = {
  updateAgentKyc,
};

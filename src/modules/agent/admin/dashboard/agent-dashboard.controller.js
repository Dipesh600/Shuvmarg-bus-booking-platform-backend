'use strict';

const asyncHandler = require('../../../../shared/http/async-handler');
const respond = require('../../../../shared/http/respond');
const service = require('./agent-dashboard.service');

const getAgentDashboard = asyncHandler(async (req, res) => {
  try {
    const result = await service.getAgentDashboard();
    return respond(res, result.statusCode, result.body);
  } catch (error) {
    console.error('getAgentDashboard error:', error);
    return respond(res, 500, {
      success: false,
      message: 'Failed to fetch agent dashboard stats',
      error: error.message,
    });
  }
});

module.exports = {
  getAgentDashboard,
};

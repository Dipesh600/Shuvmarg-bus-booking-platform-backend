'use strict';

const repository = require('./agent-dashboard.repository');
const mapper = require('./agent-dashboard.mapper');

const getDashboard = async ({ userId }) => {
  if (!userId) {
    return {
      statusCode: 401,
      body: { success: false, message: 'Unauthorized.' },
    };
  }

  const agent = await repository.findDashboardAgent(userId);
  if (!agent || agent.applicationStatus !== 'APPROVED') {
    return {
      statusCode: 403,
      body: {
        success: false,
        message: 'Dashboard available after application approval.',
      },
    };
  }

  return {
    statusCode: 200,
    body: mapper.toDashboardResponse(agent),
  };
};

module.exports = {
  getDashboard,
};

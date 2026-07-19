'use strict';

const repository = require('./agent-dashboard.repository');
const policy = require('./agent-dashboard.policy');

const getAgentDashboard = async () => {
  const counts = await repository.countAgentDashboardStats();
  return {
    statusCode: 200,
    body: policy.dashboardResponse(counts),
  };
};

module.exports = {
  getAgentDashboard,
};

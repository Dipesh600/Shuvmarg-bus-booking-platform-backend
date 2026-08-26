'use strict';

const { isAgentVerificationCleared } = require('../../../shared/identity/agent-verification');
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
  // Duplicates requireVerifiedAgent on purpose — see agent-profile.service.js.
  // Asks the shared predicate so the two cannot drift apart.
  if (!agent || !isAgentVerificationCleared(agent)) {
    return {
      statusCode: 403,
      body: {
        success: false,
        message: 'Dashboard available once your verification is complete.',
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

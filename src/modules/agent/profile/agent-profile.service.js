'use strict';

const repository = require('./agent-profile.repository');
const mapper = require('./agent-profile.mapper');

const getProfile = async ({ userId }) => {
  if (!userId) {
    return {
      statusCode: 401,
      body: { success: false, message: 'Unauthorized.' },
    };
  }

  const agent = await repository.findProfileAgent(userId);
  if (!agent) {
    return {
      statusCode: 404,
      body: { success: false, message: 'Agent profile not found.' },
    };
  }

  if (agent.applicationStatus !== 'APPROVED') {
    return {
      statusCode: 403,
      body: {
        success: false,
        message: `Your application is "${agent.applicationStatus}". Profile is available after approval.`,
        data: { applicationStatus: agent.applicationStatus },
      },
    };
  }

  return {
    statusCode: 200,
    body: mapper.toProfileResponse(agent),
  };
};

module.exports = {
  getProfile,
};

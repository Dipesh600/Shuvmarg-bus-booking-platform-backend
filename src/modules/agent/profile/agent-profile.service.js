'use strict';

const { isAgentVerificationCleared } = require('../../../shared/identity/agent-verification');
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

  // The route already runs requireVerifiedAgent. This is the handler's own
  // defensive copy, kept because the module contract does not assume its route
  // wiring — but it has to ask the same question, or an operator agent gets past
  // the gate and is refused here for a reason the gate does not recognise.
  if (!isAgentVerificationCleared(agent)) {
    return {
      statusCode: 403,
      body: {
        success: false,
        message: `Your application is "${agent.applicationStatus}". Profile is available once your verification is complete.`,
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

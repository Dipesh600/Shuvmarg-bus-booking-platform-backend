'use strict';

const repository = require('./agent-setup.repository');
const policy = require('./agent-setup.policy');
const notifications = require('./agent-setup-notification.service');

const response = (statusCode, body) => ({ statusCode, body });

const applyOperatorLinked = async (agent, data, adminId) => {
  if (!data.linkedOperatorId || !repository.isValidLinkedOperatorId(data.linkedOperatorId)) {
    return response(400, {
      success: false,
      message: 'linkedOperatorId is required for OPERATOR_LINKED agents',
    });
  }
  agent.linkedOperatorId = data.linkedOperatorId;
  agent.busAccessScope = data.busAccessScope || 'ALL_OPERATOR_BUSES';
  if (data.busAccessScope === 'SPECIFIC_ROUTES') {
    if (!data.allowedRouteIds || data.allowedRouteIds.length === 0) {
      return response(400, {
        success: false,
        message: 'allowedRouteIds is required when busAccessScope is SPECIFIC_ROUTES',
      });
    }
    agent.allowedRouteIds = data.allowedRouteIds;
  } else {
    agent.allowedRouteIds = [];
  }
  agent.applicationStatus = 'APPROVED';
  agent.approvedAt = new Date();
  agent.approvedBy = adminId || null;
  agent.submittedAt = new Date();
  await repository.activateUserForOperatorAgent(agent.user);
  return null;
};

const finalizeAgentSetup = async ({ data, adminId }) => {
  if (!data.id) return response(400, { success: false, message: 'id is required' });

  const agent = await repository.findAgentBySetupId(data.id);
  if (!agent) return response(404, { success: false, message: 'Agent not found' });

  if (data.agentType) agent.agentType = data.agentType;
  if (policy.isOperatorLinkedRequest(data)) {
    const error = await applyOperatorLinked(agent, data, adminId);
    if (error) return error;
  }
  policy.applyTruthyFields(agent, data);
  policy.applyAdminFields(agent, data);
  await repository.saveAgent(agent);
  if (policy.isOperatorLinkedRequest(data)) {
    const agentUser = await repository.findNotificationUser(agent.user);
    await notifications.notifyOperatorLinkedAgent(agentUser, agent);
  }
  return response(200, policy.successBody(agent, data));
};

module.exports = {
  finalizeAgentSetup,
};

'use strict';

const Agent = require('../../../../../models/agentModel');

const countAgentDashboardStats = async () => {
  const [
    totalAgents,
    activeAgents,
    approvedAgents,
    pendingAgents,
    rejectedAgents,
    moreInfoAgents,
    suspendedAgents,
    draftAgents,
    defaultAgents,
    operatorLinkedAgents,
  ] = await Promise.all([
    Agent.countDocuments({}),
    Agent.countDocuments({ applicationStatus: { $in: ['APPROVED', 'PENDING', 'MORE_INFO', 'SUSPENDED'] } }),
    Agent.countDocuments({ applicationStatus: 'APPROVED' }),
    Agent.countDocuments({ applicationStatus: 'PENDING' }),
    Agent.countDocuments({ applicationStatus: 'REJECTED' }),
    Agent.countDocuments({ applicationStatus: 'MORE_INFO' }),
    Agent.countDocuments({ applicationStatus: 'SUSPENDED' }),
    Agent.countDocuments({ applicationStatus: 'DRAFT' }),
    Agent.countDocuments({ agentType: 'DEFAULT' }),
    Agent.countDocuments({ agentType: 'OPERATOR_LINKED' }),
  ]);
  return {
    totalAgents,
    activeAgents,
    approvedAgents,
    pendingAgents,
    rejectedAgents,
    moreInfoAgents,
    suspendedAgents,
    draftAgents,
    defaultAgents,
    operatorLinkedAgents,
  };
};

module.exports = {
  countAgentDashboardStats,
};

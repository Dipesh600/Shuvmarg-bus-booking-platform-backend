'use strict';

const embedUser = (agentData, user) => {
  if (!user) return agentData;
  return {
    ...agentData,
    user: { _id: user._id, name: user.name, phone: user.phone, email: user.email },
  };
};

const detailsResponse = (agent, user, documents) => {
  const agentData = embedUser({ ...agent.toObject(), documents }, user);
  return {
    success: true,
    message: 'Agent details retrieved successfully!',
    data: {
      profile: user,
      agentDetails: agentData,
    },
  };
};

const agentListItem = (agent) => ({
  id: agent._id,
  agentId: agent.agentId,
  userId: agent.user?._id,
  name: agent.user?.name || 'N/A',
  phone: agent.user?.phone || 'N/A',
  email: agent.user?.email || null,
  profileImg: agent.user?.profilePicture || null,
  applicationStatus: agent.applicationStatus,
  agentType: agent.agentType,
  linkedOperator: agent.linkedOperatorId
    ? { name: agent.linkedOperatorId.brandName, code: agent.linkedOperatorId.brandCode }
    : null,
  location: [agent.municipality, agent.district].filter(Boolean).join(', ') || 'N/A',
  commission: `${agent.commissionRate}%`,
  commissionBalance: agent.commissionBalance,
  totalBookings: agent.totalOnlineBookings + agent.totalCashBookings,
  operationType: agent.operationType,
  submittedAt: agent.submittedAt,
  createdAt: agent.createdAt,
});

const listResponse = (agents) => {
  const formatted = agents.map(agentListItem);
  return {
    success: true,
    message: formatted.length === 0 ? 'No agents found.' : 'Agents retrieved successfully!',
    results: formatted.length,
    data: formatted,
  };
};

module.exports = {
  detailsResponse,
  listResponse,
};

'use strict';
const { getEffectiveRoles } = require('../../../../shared/auth/account-role.policy');

const resolveRoles = (user) => (
  getEffectiveRoles(user)
);

const hasAgentRole = (roles) => roles.includes('agent');

const successBody = (user, roles, agent) => ({
  success: true,
  message: 'Agent role added to user successfully!',
  data: {
    userId: user._id,
    roles: [...roles, 'agent'],
    agentId: agent.agentId,
    agentMongoId: agent._id,
  },
});

module.exports = {
  resolveRoles,
  hasAgentRole,
  successBody,
};

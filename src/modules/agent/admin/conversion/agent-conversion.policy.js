'use strict';

const resolveRoles = (user) => (
  user.roles && user.roles.length > 0 ? user.roles : [user.role]
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

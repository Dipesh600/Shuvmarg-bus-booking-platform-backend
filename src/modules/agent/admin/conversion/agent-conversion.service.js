'use strict';

const repository = require('./agent-conversion.repository');
const policy = require('./agent-conversion.policy');

const { requireRoleGrantResult } = require('../../../../shared/auth/role-grant-state');

const response = (statusCode, body) => ({ statusCode, body });

const makeUserAgent = async ({ id }) => {
  if (!id) {
    return response(400, { success: false, message: 'Id is required!' });
  }

  if (!repository.isValidObjectId(id)) {
    return response(400, { success: false, message: 'Invalid user ID format!' });
  }

  return repository.withTransaction(async session => {
    const user = await repository.findUserById(id, session);
    if (!user) {
      return response(404, { success: false, message: 'User not found!' });
    }

    const userRoles = policy.resolveRoles(user);
    if (policy.hasAgentRole(userRoles)) {
      return response(400, { success: false, message: 'User is already an agent!' });
    }

    requireRoleGrantResult(await repository.addAgentRoleToUser(id, session));
    let agent = await repository.findAgentByUserId(user._id, session);
    if (!agent) {
      agent = await repository.createAgentForUser(user._id, session);
    }

    return response(200, policy.successBody(user, userRoles, agent));
  });
};

module.exports = {
  makeUserAgent,
};

'use strict';

const repository = require('./agent-conversion.repository');
const policy = require('./agent-conversion.policy');

const response = (statusCode, body) => ({ statusCode, body });

const makeUserAgent = async ({ id }) => {
  if (!id) {
    return response(400, { success: false, message: 'Id is required!' });
  }

  if (!repository.isValidObjectId(id)) {
    return response(400, { success: false, message: 'Invalid user ID format!' });
  }

  const user = await repository.findUserById(id);
  if (!user) {
    return response(404, { success: false, message: 'User not found!' });
  }

  const userRoles = policy.resolveRoles(user);
  if (policy.hasAgentRole(userRoles)) {
    return response(400, { success: false, message: 'User is already an agent!' });
  }

  await repository.addAgentRoleToUser(id);
  let agent = await repository.findAgentByUserId(user._id);
  if (!agent) {
    agent = await repository.createAgentForUser(user._id);
  }

  return response(200, policy.successBody(user, userRoles, agent));
};

module.exports = {
  makeUserAgent,
};

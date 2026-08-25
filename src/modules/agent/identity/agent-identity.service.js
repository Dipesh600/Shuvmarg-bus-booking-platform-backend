'use strict';

const AppError = require('../../../shared/errors/app-error');
const mapper = require('./agent-identity.mapper');
const policy = require('./agent-identity.policy');
const repository = require('./agent-identity.repository');

const noAgentError = () => new AppError('No agent profile found for this account.', 404, {
  success: false,
  message: 'No agent profile found for this account.',
  errorCode: 'NO_AGENT_PROFILE',
});

const invalidPatchError = (errors) => new AppError(errors[0], 400, {
  success: false,
  message: errors[0],
  errors,
});

/**
 * Fill in a missing `code` on an agent that predates the SM-AG scheme.
 *
 * Agent profiles are created with findOneAndUpdate({upsert:true}), and Mongoose
 * does not run pre('save') for upserts — so rows created that way carry neither
 * identifier until something saves them. Calling save() with both fields blank
 * lets the hook allocate; the hook only ever fills a blank, so an agent who
 * already has a published code keeps it.
 */
const backfillIdentifiers = async (agent) => {
  if (agent.code && agent.agentId) return agent;
  await repository.saveAgent(agent);
  return agent;
};

const loadIdentity = async (userId) => {
  const agent = await repository.findAgentByUserId(userId);
  if (!agent) throw noAgentError();
  await backfillIdentifiers(agent);
  const user = await repository.findUserById(userId);
  return { agent, user };
};

const getIdentity = async (userId) => {
  const { agent, user } = await loadIdentity(userId);
  return { statusCode: 200, responseBody: mapper.toIdentityResponse(agent, user) };
};

const getCode = async (userId) => {
  const { agent } = await loadIdentity(userId);
  return { statusCode: 200, responseBody: mapper.toCodeResponse(agent) };
};

const updateIdentity = async (userId, body) => {
  const { agentPatch, userPatch, errors, isEmpty } = policy.buildProfilePatch(body);
  if (errors.length > 0) throw invalidPatchError(errors);

  const { agent, user } = await loadIdentity(userId);
  if (isEmpty) {
    return { statusCode: 200, responseBody: mapper.toUpdatedIdentityResponse(agent, user) };
  }

  for (const [field, value] of Object.entries(agentPatch)) {
    agent.set(field, value);
  }
  if (Object.keys(agentPatch).length > 0) await repository.saveAgent(agent);

  const updatedUser = userPatch.name
    ? await repository.updateUserName(userId, userPatch.name)
    : user;

  return {
    statusCode: 200,
    responseBody: mapper.toUpdatedIdentityResponse(agent, updatedUser),
  };
};

module.exports = {
  backfillIdentifiers,
  getCode,
  getIdentity,
  loadIdentity,
  updateIdentity,
};
